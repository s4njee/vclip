import { useState, useRef } from 'react'
import ffmpegCoreURL from '@ffmpeg/core?url'
import ffmpegWasmURL from '@ffmpeg/core/wasm?url'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'
import { Button } from './components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card'
import { Label } from './components/ui/label'
import { FileVideo, ScanSearch, X } from 'lucide-react'

export default function LocalMode() {
  const [file, setFile] = useState(null)
  const [output, setOutput] = useState('')
  const [status, setStatus] = useState('idle') // idle | loading-wasm | probing | done | error
  const [statusMsg, setStatusMsg] = useState('')
  const ffmpegRef = useRef(null)
  const fileInputRef = useRef(null)
  const outputEndRef = useRef(null)

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0]
    if (selected) {
      setFile(selected)
      setOutput('')
      setStatus('idle')
    }
  }

  const handleClearFile = () => {
    setFile(null)
    setOutput('')
    setStatus('idle')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleProbe = async () => {
    if (!file) return
    const logs = []
    let ffmpeg = ffmpegRef.current
    let createdFFmpeg = false

    try {
      if (!ffmpeg) {
        createdFFmpeg = true
        setStatus('loading-wasm')
        setStatusMsg('Loading ffmpeg WebAssembly...')
        ffmpeg = new FFmpeg()
        await ffmpeg.load({
          coreURL: ffmpegCoreURL,
          wasmURL: ffmpegWasmURL,
        })
        ffmpegRef.current = ffmpeg
      }

      const logHandler = ({ message }) => logs.push(message)
      ffmpeg.on('log', logHandler)

      setStatus('probing')
      setStatusMsg('Writing file to WASM filesystem...')
      await ffmpeg.writeFile('input', await fetchFile(file))

      setStatusMsg('Running ffprobe...')
      await ffmpeg.exec(['-hide_banner', '-i', 'input'])

      ffmpeg.off('log', logHandler)
      await ffmpeg.deleteFile('input')

      setOutput(logs.join('\n') || 'No output captured.')
      setStatus('done')
      setStatusMsg('')
    } catch (err) {
      console.error('[LocalMode] ffprobe error:', err)
      const errText = err instanceof Error ? err.message : String(err)
      setOutput(logs.length > 0 ? logs.join('\n') : `Error: ${errText}`)
      setStatus(logs.length > 0 ? 'done' : 'error')
      setStatusMsg('')
      if (createdFFmpeg) ffmpegRef.current = null
      try { ffmpegRef.current?.deleteFile('input') } catch {}
    }
  }

  const isRunning = status === 'loading-wasm' || status === 'probing'

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileVideo className="h-5 w-5" />
            Probe Video File
          </CardTitle>
          <CardDescription>
            Select a local video file to inspect its streams and metadata using ffprobe via WebAssembly — no server required.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Video File</Label>
            <div className="flex gap-2">
              <div
                className="flex-1 flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileVideo className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className={file ? 'text-foreground' : 'text-muted-foreground'}>
                  {file ? file.name : 'Click to select a video file...'}
                </span>
                {file && (
                  <span className="ml-auto text-xs text-muted-foreground shrink-0">
                    {(file.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*,audio/*"
                className="hidden"
                onChange={handleFileChange}
              />
              {file && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleClearFile}
                  aria-label="Clear file"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          <Button
            onClick={handleProbe}
            disabled={!file || isRunning}
            className="w-full"
          >
            <ScanSearch className="h-4 w-4 mr-2" />
            {isRunning ? statusMsg : 'Run ffprobe'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">ffprobe Output</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-black rounded-md p-4 h-64 overflow-y-auto font-mono text-xs">
            {!output ? (
              <p className="text-gray-500">
                {isRunning ? statusMsg : 'Output will appear here...'}
              </p>
            ) : (
              <>
                <pre className={`whitespace-pre-wrap ${status === 'error' ? 'text-red-400' : 'text-gray-200'}`}>
                  {output}
                </pre>
                <div ref={outputEndRef} />
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
