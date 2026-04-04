import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import express from 'express'
import path from 'path'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 3001

const app = express()
app.use(express.static(path.join(__dirname, 'client/dist')))

app.get('/api/readdir', (req, res) => {
  try {
    const targetPath = req.query.path || '/';
    let dirToRead = targetPath;
    let prefix = '';

    let isExactDir = false;
    try {
      isExactDir = fs.statSync(targetPath).isDirectory();
    } catch (e) {}

    if (!isExactDir && targetPath !== '/') {
      dirToRead = path.dirname(targetPath);
      prefix = path.basename(targetPath).toLowerCase();
    }

    try {
      if (!fs.statSync(dirToRead).isDirectory()) return res.json({ items: [] });
    } catch(e) {
      return res.json({ items: [] });
    }

    const files = fs.readdirSync(dirToRead, { withFileTypes: true });
    
    const items = files
      .filter(f => !f.name.startsWith('.'))
      .filter(f => f.name.toLowerCase().startsWith(prefix))
      .map(f => {
        const isDir = f.isDirectory();
        let fullPath = path.join(dirToRead, f.name);
        if (isDir) fullPath += '/';
        return { name: f.name, isDir, fullPath };
      })
      .sort((a,b) => b.isDir - a.isDir || a.name.localeCompare(b.name));
      
    res.json({ items: items.slice(0, 100) });
  } catch (err) {
    res.json({ error: err.message, items: [] });
  }
});

app.get('/{*path}', (_, res) => res.sendFile(path.join(__dirname, 'client/dist/index.html')))

const server = createServer(app)
const wss = new WebSocketServer({ server })

server.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}`)
})

const toSeconds = (t) => {
  if (typeof t === 'number') return t
  const parts = t.split(':').map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parseFloat(t)
}

wss.on('connection', (ws) => {
  let ffmpegProcess = null

  ws.on('message', (raw) => {
    let msg
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }))
      return
    }

    if (msg.action === 'kill') {
      if (ffmpegProcess) {
        ffmpegProcess.kill('SIGTERM')
        ffmpegProcess = null
      }
      return
    }

    if (msg.action === 'analyze') {
      const { inputPath } = msg
      if (!fs.existsSync(inputPath)) {
        ws.send(JSON.stringify({ type: 'error', message: `File not found: ${inputPath}` }))
        return
      }
      const proc = spawn('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_streams',
        inputPath,
      ])
      let output = ''
      proc.stdout.on('data', (d) => { output += d })
      proc.on('close', (code) => {
        if (code !== 0) {
          ws.send(JSON.stringify({ type: 'error', message: 'ffprobe failed' }))
          return
        }
        const { streams } = JSON.parse(output)
        let subtitleIdx = 0
        const parsed = streams.map((s) => ({
          index: s.index,
          codecType: s.codec_type,
          codecName: s.codec_name,
          language: s.tags?.language,
          title: s.tags?.title,
          // si= index within subtitle streams only, used by the subtitles filter
          subtitleSi: s.codec_type === 'subtitle' ? subtitleIdx++ : undefined,
        }))
        ws.send(JSON.stringify({ type: 'analyzed', streams: parsed }))
      })
      return
    }

    const { inputPath, outputPath, startTime, endTime, burnSubtitle, subtitleSi, audioIndex } = msg

    if (!inputPath || !startTime || !endTime) {
      ws.send(JSON.stringify({ type: 'error', message: 'inputPath, startTime, and endTime are required' }))
      return
    }

    if (!fs.existsSync(inputPath)) {
      ws.send(JSON.stringify({ type: 'error', message: `Input file not found: ${inputPath}` }))
      return
    }

    const ext = path.extname(inputPath)
    const base = path.basename(inputPath, ext)
    const dir = path.dirname(inputPath)
    const outputDir = process.env.VCLIP_OUTPUT || dir
    const resolvedOutput = outputPath || path.join(outputDir, `${base}_clip_${Date.now()}.mp4`)

    const startSec = toSeconds(startTime)
    const endSec = toSeconds(endTime)
    const duration = endSec - startSec

    if (duration <= 0) {
      ws.send(JSON.stringify({ type: 'error', message: 'End time must be after start time' }))
      return
    }

    // Escape input path for use inside the subtitles filter value
    const escapedPath = inputPath.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/:/g, '\\:')

    const args = [
      '-ss', String(startSec),
      '-i', inputPath,
      '-t', String(duration),
      '-map', '0:v:0',
      '-map', audioIndex != null ? `0:${audioIndex}` : '0:a:0',
      ...(burnSubtitle
        ? ['-vf', `subtitles='${escapedPath}':si=${subtitleSi ?? 0}`]
        : []),
      '-c:v', 'libx265',
      '-crf', '18',
      '-preset', 'fast',
      '-c:a', 'copy',
      '-sn',
      '-y',
      resolvedOutput,
    ]

    ws.send(JSON.stringify({ type: 'stderr', data: `Running: ffmpeg ${args.join(' ')}` }))

    ffmpegProcess = spawn('ffmpeg', args)

    ffmpegProcess.stdout.on('data', (data) => {
      ws.send(JSON.stringify({ type: 'stdout', data: data.toString() }))
    })

    ffmpegProcess.stderr.on('data', (data) => {
      ws.send(JSON.stringify({ type: 'stderr', data: data.toString() }))
    })

    ffmpegProcess.on('close', (code) => {
      ws.send(JSON.stringify({ type: 'exit', code, outputPath: resolvedOutput }))
      ffmpegProcess = null
    })

    ffmpegProcess.on('error', (err) => {
      ws.send(JSON.stringify({ type: 'error', message: err.message }))
      ffmpegProcess = null
    })
  })

  ws.on('close', () => {
    if (ffmpegProcess) {
      ffmpegProcess.kill('SIGTERM')
      ffmpegProcess = null
    }
  })
})
