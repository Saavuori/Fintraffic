import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Backend origin for the dev proxy; API_PROXY overrides it when the backend
// runs on a non-default port (e.g. API_PROXY=http://127.0.0.1:8090).
const apiTarget = process.env.API_PROXY ?? 'http://127.0.0.1:8080'
const wsTarget = apiTarget.replace(/^http/, 'ws')

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      '/api/meri/stream': {
        target: wsTarget,
        ws: true,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.error('WS Proxy Error:', err);
          });
        }
      },
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
})
