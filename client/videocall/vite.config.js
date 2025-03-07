import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  server: {
    allowedHosts: [
      ' https://beautiful-conscious-northern-audience.trycloudflare.com '
      
    ]},
  plugins: [react()],
})
