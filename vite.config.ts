import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// SharedArrayBuffer requires Cross-Origin Isolation headers
const coiHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'esnext',   // enable top-level await
  },
  server: { headers: coiHeaders },
  preview: { headers: coiHeaders },
  worker: {
    format: 'es',
  },
})
