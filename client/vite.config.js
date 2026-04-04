import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/': {
        target: 'ws://localhost:3001',
        ws: true,
        changeOrigin: true,
        bypass(req) {
          // Don't proxy static public files — let Vite serve them directly
          if (req.url?.startsWith('/ffmpeg-core')) return req.url
        },
      },
    },
  },
})
