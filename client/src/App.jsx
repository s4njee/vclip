import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Label } from './components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card'
import { Badge } from './components/ui/badge'
import { Scissors, Square, ScanSearch, Moon, Sun, Play } from 'lucide-react'

const WS_URL = import.meta.env.VITE_WS_URL ||
  `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`

function TrackBadge({ type }) {
  const styles = {
    video: 'bg-blue-100 text-blue-800',
    audio: 'bg-green-100 text-green-800',
    subtitle: 'bg-purple-100 text-purple-800',
  }
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[type] ?? 'bg-gray-100 text-gray-800'}`}>
      {type}
    </span>
  )
}

export default function App() {
  const [inputPath, setInputPath] = useState('')
  const [outputPath, setOutputPath] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [logs, setLogs] = useState([])
  const [status, setStatus] = useState('idle') // idle | connecting | running | done | error
  const [streams, setStreams] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [burnSubtitle, setBurnSubtitle] = useState(false)
  const [selectedSubtitleSi, setSelectedSubtitleSi] = useState(0)
  const [selectedAudioIndex, setSelectedAudioIndex] = useState(null)
  const [darkMode, setDarkMode] = useState(false)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const [clipStart, setClipStart] = useState(null)
  const [clipEnd, setClipEnd] = useState(null)
  const wsRef = useRef(null)
  const logsEndRef = useRef(null)
  const videoRef = useRef(null)

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  // Clear analysis when input path changes
  useEffect(() => {
    setStreams(null)
    setBurnSubtitle(false)
    setSelectedAudioIndex(null)
  }, [inputPath])

  // Dark mode toggle
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [darkMode])

  // Setup preview video when input path changes and file is analyzed
  useEffect(() => {
    if (inputPath && streams) {
      const url = URL.createObjectURL(new Blob([], { type: 'application/octet-stream' })) // placeholder
      setPreviewUrl(null)
      // For now, just clear preview URL
    }
  }, [inputPath, streams])

  // Cleanup preview URL
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  // Preview functions
  const handlePreviewFile = (path) => {
    if (!path) return
    // In a real implementation, this would fetch the video file and create a preview
    // For now, we'll set a placeholder
    console.log('Previewing:', path)
    setPreviewUrl(path) // Use the file path directly for local preview
    setClipStart(null)
    setClipEnd(null)
    setPreviewPlaying(false)
  }

  const togglePreviewPlay = () => {
    if (videoRef.current) {
      if (previewPlaying) {
        videoRef.current.pause()
      } else {
        videoRef.current.play()
      }
      setPreviewPlaying(!previewPlaying)
    }
  }

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percent = x / rect.width
    const videoDuration = videoRef.current?.duration || 0
    const seekTime = percent * videoDuration
    setClipStart(seekTime)
    setPreviewPlaying(false)
    if (videoRef.current) {
      videoRef.current.currentTime = seekTime
    }
  }

  const handleClipFromPreview = () => {
    if (clipStart !== null && clipEnd !== null) {
      setStartTime(clipStart.toFixed(2))
      setEndTime(clipEnd.toFixed(2))
      appendLog(`Clip set from ${clipStart}s to ${clipEnd}s`, 'info')
    }
  }

  const handleClearClip = () => {
    setClipStart(null)
    setClipEnd(null)
    if (videoRef.current) {
      videoRef.current.currentTime = 0
    }
  }

  const appendLog = useCallback((text, type = 'info') => {
    setLogs(prev => [...prev, { text, type, id: Date.now() + Math.random() }])
  }, [])

  const getWs = () => {
    if (wsRef.current) wsRef.current.close()
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws
    return ws
  }

  const handleAnalyze = () => {
    if (!inputPath) return
    setAnalyzing(true)
    setStreams(null)
    const ws = getWs()
    ws.onopen = () => ws.send(JSON.stringify({ action: 'analyze', inputPath }))
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'analyzed') {
        setStreams(msg.streams)
        setSelectedSubtitleSi(0)
        const firstAudio = msg.streams.find(s => s.codecType === 'audio')
        setSelectedAudioIndex(firstAudio?.index ?? null)
        setAnalyzing(false)
        ws.close()
      } else if (msg.type === 'error') {
        appendLog(`Analyze error: ${msg.message}`, 'error')
        setAnalyzing(false)
        ws.close()
      }
    }
    ws.onerror = () => {
      appendLog('WebSocket error during analyze.', 'error')
      setAnalyzing(false)
    }
  }

  const handleClip = () => {
    if (!inputPath || !startTime || !endTime) {
      appendLog('Please fill in input path, start time, and end time.', 'error')
      return
    }
    setLogs([])
    setStatus('connecting')
    const ws = getWs()

    ws.onopen = () => {
      setStatus('running')
      appendLog('Connected. Starting ffmpeg...', 'info')
      ws.send(JSON.stringify({
        inputPath,
        outputPath: outputPath || undefined,
        startTime,
        endTime,
        burnSubtitle,
        subtitleSi: selectedSubtitleSi,
        audioIndex: selectedAudioIndex,
      }))
    }

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'stdout' || msg.type === 'stderr') {
        appendLog(msg.data, msg.type)
      } else if (msg.type === 'exit') {
        if (msg.code === 0) {
          setStatus('done')
          appendLog(`Done. Exit code: ${msg.code}`, 'success')
          appendLog(`Output saved to: ${msg.outputPath}`, 'success')
        } else {
          setStatus('error')
          appendLog(`ffmpeg exited with code ${msg.code}`, 'error')
        }
        ws.close()
      } else if (msg.type === 'error') {
        setStatus('error')
        appendLog(`Error: ${msg.message}`, 'error')
        ws.close()
      }
    }

    ws.onerror = () => {
      setStatus('error')
      appendLog('WebSocket error. Is the server running?', 'error')
    }

    ws.onclose = () => {
      if (status === 'running') setStatus('idle')
    }
  }

  const handleStop = () => {
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({ action: 'kill' }))
      wsRef.current.close()
      wsRef.current = null
    }
    setStatus('idle')
    appendLog('Stopped by user.', 'info')
  }

  const isRunning = status === 'running' || status === 'connecting'
  const subtitleStreams = streams?.filter(s => s.codecType === 'subtitle') ?? []
  const audioStreams = streams?.filter(s => s.codecType === 'audio') ?? []

  const statusBadge = {
    idle: <Badge variant="secondary">Idle</Badge>,
    connecting: <Badge variant="outline">Connecting...</Badge>,
    running: <Badge className="bg-blue-500 text-white">Running</Badge>,
    done: <Badge className="bg-green-500 text-white">Done</Badge>,
    error: <Badge variant="destructive">Error</Badge>,
  }[status]

  const durationToTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '00:00'
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div className="min-h-screen bg-background dark:bg-slate-950 text-foreground dark:text-slate-100" style={{minHeight: '100vh', padding: '2rem'}}>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Scissors className="h-8 w-8" />
            <div>
              <h1 className="text-3xl font-bold tracking-tight">vclip</h1>
              <p className="text-muted-foreground text-sm">Clip videos with ffmpeg</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setDarkMode(!darkMode)}
            className="rounded-full"
            aria-label="Toggle dark mode"
          >
            {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Clip Settings
              {statusBadge}
            </CardTitle>
            <CardDescription>
              Provide a video file path and timestamps to extract a clip.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="input-path">Input File Path</Label>
              <div className="flex gap-2">
                <Input
                  id="input-path"
                  placeholder="/path/to/video.mp4"
                  value={inputPath}
                  onChange={e => setInputPath(e.target.value)}
                  disabled={isRunning}
                />
                <Button
                  variant="outline"
                  onClick={handleAnalyze}
                  disabled={!inputPath || isRunning || analyzing}
                >
                  <ScanSearch className="h-4 w-4 mr-2" />
                  {analyzing ? 'Analyzing...' : 'Analyze'}
                </Button>
              </div>
            </div>

            {streams && (
              <>
                <div className="rounded-md border p-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tracks</p>
                  <div className="space-y-1">
                    {streams.map(s => (
                      <div key={s.index} className="flex items-center gap-2 text-sm">
                        <TrackBadge type={s.codecType} />
                        <span className="font-mono text-muted-foreground">#{s.index}</span>
                        <span>{s.codecName}</span>
                        {s.language && <span className="text-muted-foreground">[{s.language}]</span>}
                        {s.title && <span className="text-muted-foreground">— {s.title}</span>}
                      </div>
                    ))}
                  </div>

                  {audioStreams.length > 1 && (
                    <div className="pt-2 border-t space-y-2">
                      <Label>Audio Track</Label>
                      <select
                        value={selectedAudioIndex ?? ''}
                        onChange={e => setSelectedAudioIndex(Number(e.target.value))}
                        disabled={isRunning}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {audioStreams.map(s => (
                          <option key={s.index} value={s.index}>
                            #{s.index} {s.codecName}
                            {s.language ? ` [${s.language}]` : ''}
                            {s.title ? ` — ${s.title}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {subtitleStreams.length > 0 && (
                    <div className="pt-2 border-t space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="burn-subtitles"
                          checked={burnSubtitle}
                          onChange={e => setBurnSubtitle(e.target.checked)}
                          disabled={isRunning}
                          className="h-4 w-4"
                        />
                        <Label htmlFor="burn-subtitles">Burn in subtitles</Label>
                      </div>
                      {burnSubtitle && (
                        <>
                          <select
                            value={selectedSubtitleSi}
                            onChange={e => setSelectedSubtitleSi(Number(e.target.value))}
                            disabled={isRunning}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {subtitleStreams.map(s => (
                              <option key={s.index} value={s.subtitleSi}>
                                #{s.index} {s.codecName}
                                {s.language ? ` [${s.language}]` : ''}
                                {s.title ? ` — ${s.title}` : ''}
                              </option>
                            ))}
                          </select>
                          {(() => {
                            const IMAGE_CODECS = ['hdmv_pgs_subtitle', 'dvd_subtitle', 'dvbsub', 'xsub']
                            const selected = subtitleStreams.find(s => s.subtitleSi === selectedSubtitleSi)
                            if (selected && IMAGE_CODECS.includes(selected.codecName)) {
                              return (
                                <p className="text-xs text-amber-600">
                                  Warning: {selected.codecName} is an image-based subtitle format and cannot be burned in with this tool. Only text-based formats (ASS, SRT, SSA) are supported.
                                </p>
                              )
                            }
                          })()}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Video Preview Section */}
                {inputPath && (
                  <div className="rounded-md border p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Video Preview</p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePreviewFile(inputPath)}
                          disabled={previewPlaying}
                        >
                          <ScanSearch className="h-4 w-4 mr-1" />
                          Load
                        </Button>
                        {previewUrl && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleClearClip}
                          >
                            Clear Clip
                          </Button>
                        )}
                      </div>
                    </div>

                    {previewUrl && (
                      <>
                        <div className="relative bg-black rounded-md overflow-hidden aspect-video group">
                          <video
                            ref={videoRef}
                            src={previewUrl}
                            className="w-full h-full"
                            onLoadedMetadata={(e) => {
                              const duration = e.target.duration
                              console.log('Video loaded:', duration, 'seconds')
                            }}
                            onError={(e) => {
                              console.error('Video error:', e)
                              appendLog('Could not load video preview. The file may need to be served by the server.', 'error')
                            }}
                          />
                          {/* Seek Controls Overlay */}
                          <div
                            className="absolute inset-x-0 bottom-0 p-2 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={handleSeek}
                          >
                            <div className="h-1 bg-gray-600 rounded cursor-pointer">
                              <div
                                className="h-full bg-blue-500 rounded transition-all"
                                style={{
                                  width: clipStart !== null ? `${(clipStart / (videoRef.current?.duration || 1)) * 100}%` : '0%'
                                }}
                              />
                            </div>
                          </div>
                          {/* Play/Pause Button */}
                          <Button
                            variant="secondary"
                            size="icon"
                            className="absolute top-2 right-2 h-8 w-8 rounded-full"
                            onClick={togglePreviewPlay}
                            aria-label={previewPlaying ? 'Pause' : 'Play'}
                          >
                            {previewPlaying ? (
                              <Square className="h-4 w-4" />
                            ) : (
                              <Play className="h-4 w-4" />
                            )}
                          </Button>
                          {/* Current Time Display */}
                          <div className="absolute bottom-2 left-2 text-white text-xs font-mono bg-black/70 px-2 py-1 rounded">
                            {durationToTime(videoRef.current?.currentTime || 0)} / {durationToTime(videoRef.current?.duration || 0)}
                          </div>
                        </div>
                        {/* Clip Selection Display */}
                        {(clipStart !== null || clipEnd !== null) && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Selected range:</span>
                            <span className="font-mono">
                              {clipStart !== null ? durationToTime(clipStart) : '00:00:00'} — {clipEnd !== null ? durationToTime(clipEnd) : '---'}
                            </span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="output-path">Output File Path <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                id="output-path"
                placeholder="Auto-generated if left blank"
                value={outputPath}
                onChange={e => setOutputPath(e.target.value)}
                disabled={isRunning}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start-time">Start Time</Label>
                <Input
                  id="start-time"
                  placeholder="00:00:10 or 10.5"
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  disabled={isRunning}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-time">End Time</Label>
                <Input
                  id="end-time"
                  placeholder="00:01:30 or 90"
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                  disabled={isRunning}
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={handleClip} disabled={isRunning} className="flex-1">
                <Scissors className="h-4 w-4 mr-2" />
                Clip Video
              </Button>
              {isRunning && (
                <Button variant="destructive" onClick={handleStop}>
                  <Square className="h-4 w-4 mr-2" />
                  Stop
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">ffmpeg Output</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-black rounded-md p-4 h-64 overflow-y-auto font-mono text-xs space-y-0.5">
              {logs.length === 0 ? (
                <p className="text-gray-500">Output will appear here...</p>
              ) : (
                logs.map(log => (
                  <div
                    key={log.id}
                    className={
                      log.type === 'error' ? 'text-red-400' :
                      log.type === 'success' ? 'text-green-400' :
                      log.type === 'stderr' ? 'text-yellow-300' :
                      'text-gray-200'
                    }
                  >
                    {log.text}
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
