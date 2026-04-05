import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Label } from './components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card'
import { Badge } from './components/ui/badge'
import { Scissors, Square, ScanSearch, Moon, Sun, Play } from 'lucide-react'
import LocalMode from './LocalMode'

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
  const [ffmpegCommand, setFfmpegCommand] = useState('')
  const [status, setStatus] = useState('idle') // idle | connecting | running | done | error
  const [streams, setStreams] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [burnSubtitle, setBurnSubtitle] = useState(false)
  const [flipHorizontal, setFlipHorizontal] = useState(false)
  const [selectedSubtitleSi, setSelectedSubtitleSi] = useState(0)
  const [selectedAudioIndex, setSelectedAudioIndex] = useState(null)
  const [darkMode, setDarkMode] = useState(false)
  const [view, setView] = useState('vclip') // 'vclip' | 'local'
  const [previewUrl, setPreviewUrl] = useState(null)
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const [previewSeeking, setPreviewSeeking] = useState(false)
  const [clipStart, setClipStart] = useState(null)
  const [clipEnd, setClipEnd] = useState(null)
  const [pathSuggestions, setPathSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const suggestionBoxRef = useRef(null)
  const wsRef = useRef(null)
  const logsEndRef = useRef(null)
  const videoRef = useRef(null)

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  // handles closing suggestion box on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (suggestionBoxRef.current && !suggestionBoxRef.current.contains(e.target)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // fetch suggestions when inputPath changes
  useEffect(() => {
    if (!inputPath || view !== 'vclip') {
      setPathSuggestions([])
      return
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/readdir?path=${encodeURIComponent(inputPath)}`)
        const data = await res.json()
        if (data.items) setPathSuggestions(data.items)
      } catch (err) {
        console.error("Autocomplete err:", err)
      }
    }, 150)
    return () => clearTimeout(timer)
  }, [inputPath, view])

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

  // Auto-load preview when file is analyzed
  useEffect(() => {
    if (inputPath && streams) {
      handlePreviewFile(inputPath)
    }
  }, [streams])

  // Enforce clip boundaries during playback
  useEffect(() => {
    const video = videoRef.current
    if (!video || !previewUrl) return

    const parseTime = (t) => {
      if (!t || t === '') return null
      if (!isNaN(Number(t))) return Number(t)
      const parts = t.split(':').map(Number)
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
      if (parts.length === 2) return parts[0] * 60 + parts[1]
      return null
    }

    const start = parseTime(startTime)
    const end = parseTime(endTime)

    const onTimeUpdate = () => {
      if (end !== null && video.currentTime >= end) {
        if (start !== null) {
          video.currentTime = start
        } else {
          video.pause()
          setPreviewPlaying(false)
        }
      }
    }

    video.addEventListener('timeupdate', onTimeUpdate)
    return () => video.removeEventListener('timeupdate', onTimeUpdate)
  }, [previewUrl, startTime, endTime])

  // Preview functions
  const handlePreviewFile = (path) => {
    if (!path) return
    console.log('Previewing via API:', path)
    setPreviewUrl(`/api/video?path=${encodeURIComponent(path)}`)
    setClipStart(null)
    setClipEnd(null)
    setPreviewPlaying(false)
  }

  const parseTime = (t) => {
    if (!t || t === '') return null
    if (!isNaN(Number(t))) return Number(t)
    const parts = t.split(':').map(Number)
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
    if (parts.length === 2) return parts[0] * 60 + parts[1]
    return null
  }

  const togglePreviewPlay = () => {
    const video = videoRef.current
    if (!video) return

    if (previewPlaying) {
      video.pause()
      setPreviewPlaying(false)
    } else {
      const start = parseTime(startTime)
      const doPlay = () => {
        setPreviewSeeking(false)
        video.play().then(() => {
          setPreviewPlaying(true)
        }).catch((err) => {
          console.error('play() failed:', err)
          setPreviewPlaying(false)
        })
      }
      if (start !== null) {
        setPreviewSeeking(true)
        let seekTimer
        const onSeeked = () => {
          clearTimeout(seekTimer)
          video.removeEventListener('seeked', onSeeked)
          doPlay()
        }
        // Fallback: if seeked never fires (e.g. unsupported format), unblock after 2s
        seekTimer = setTimeout(() => {
          video.removeEventListener('seeked', onSeeked)
          doPlay()
        }, 2000)
        video.addEventListener('seeked', onSeeked)
        video.currentTime = start
      } else {
        doPlay()
      }
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
    setFfmpegCommand('')
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
        flipHorizontal,
        subtitleSi: selectedSubtitleSi,
        audioIndex: selectedAudioIndex,
      }))
    }

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'stdout' || msg.type === 'stderr') {
        appendLog(msg.data, msg.type)
      } else if (msg.type === 'command') {
        setFfmpegCommand(msg.data)
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

        <div className="flex border-b">
          {[
            { id: 'vclip', label: 'vclip' },
            { id: 'local', label: 'Local Mode' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setView(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                view === tab.id
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {view === 'local' ? <LocalMode /> : (<>

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
              <div className="flex flex-wrap gap-2 text-xs mb-2">
                <span className="text-muted-foreground mr-1">Quick paths:</span>
                {['/mnt/raid6/anime/', '/mnt/raid6/movies/', '/mnt/raid6/tv/', '/mnt/raid6/documentary/'].map(mount => (
                  <button 
                    key={mount} 
                    onClick={() => { setInputPath(mount); setShowSuggestions(true); document.getElementById('input-path')?.focus(); }}
                    className="text-blue-500 hover:text-blue-700 hover:underline cursor-pointer"
                  >
                    {mount}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 relative">
                <div ref={suggestionBoxRef} className="flex-1 relative">
                  <Input
                    id="input-path"
                    placeholder="/path/to/video.mp4"
                    value={inputPath}
                    onChange={e => { setInputPath(e.target.value); setShowSuggestions(true); }}
                    onFocus={() => setShowSuggestions(true)}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck="false"
                    disabled={isRunning}
                  />
                  {showSuggestions && pathSuggestions.length > 0 && (
                    <ul className="absolute z-10 top-full left-0 right-0 mt-1 max-h-60 overflow-auto bg-background border border-border rounded-md shadow-lg py-1 text-left">
                      {pathSuggestions.map(s => (
                        <li 
                          key={s.fullPath}
                          className="px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer flex items-center justify-between"
                          onMouseDown={(e) => {
                            // use onMouseDown instead of onClick to prevent input blur from firing before this
                            e.preventDefault();
                            setInputPath(s.fullPath);
                            if (!s.isDir) setShowSuggestions(false);
                            document.getElementById('input-path')?.focus();
                          }}
                        >
                          <span className="truncate">{s.name}</span>
                          <Badge variant={s.isDir ? "secondary" : "outline"} className="text-[10px] ml-2 shrink-0">{s.isDir ? 'DIR' : 'FILE'}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
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

                  <div className="pt-2 border-t space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="flip-horizontal"
                        checked={flipHorizontal}
                        onChange={e => setFlipHorizontal(e.target.checked)}
                        disabled={isRunning}
                        className="h-4 w-4"
                      />
                      <Label htmlFor="flip-horizontal">Flip video horizontally</Label>
                    </div>
                  </div>
                </div>

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

            {/* Video Preview Section - below clip inputs */}
            {previewUrl && (
              <div className="rounded-md border p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Clip Preview</p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePreviewFile(inputPath)}
                    >
                      <ScanSearch className="h-4 w-4 mr-1" />
                      Reload
                    </Button>
                  </div>
                </div>

                <div className="relative bg-black rounded-md overflow-hidden aspect-video group">
                  <video
                    ref={videoRef}
                    src={previewUrl}
                    className="w-full h-full"
                    onLoadedMetadata={(e) => {
                      console.log('Video loaded:', e.target.duration, 'seconds')
                    }}
                    onError={(e) => {
                      console.error('Video error:', e)
                      appendLog('Could not load video preview. The file may need to be served by the server.', 'error')
                    }}
                  />
                  {/* Seeking indicator */}
                  {previewSeeking && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <span className="text-white text-sm font-medium">Seeking...</span>
                    </div>
                  )}
                  {/* Play/Pause Button */}
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute top-2 right-2 h-8 w-8 rounded-full"
                    onClick={togglePreviewPlay}
                    disabled={previewSeeking}
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
                  {/* Clip region indicator */}
                  {startTime && endTime && (
                    <div className="absolute bottom-2 right-2 text-white text-xs font-mono bg-blue-600/80 px-2 py-1 rounded">
                      Clip: {startTime} → {endTime}
                    </div>
                  )}
                </div>

                {startTime && endTime && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={togglePreviewPlay}
                      disabled={previewSeeking}
                    >
                      <Play className="h-4 w-4 mr-2" />
                      {previewSeeking ? 'Seeking...' : previewPlaying ? 'Pause' : 'Preview Clip'}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      {startTime} → {endTime} (loops)
                    </p>
                  </div>
                )}
              </div>
            )}

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
            <CardTitle className="text-base">ffmpeg Command</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-black rounded-md p-4 overflow-x-auto whitespace-pre-wrap font-mono text-xs text-blue-300">
              {ffmpegCommand || <span className="text-gray-500">Command will appear here...</span>}
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

        </>)}
      </div>
    </div>
  )
}
