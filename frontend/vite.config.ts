import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig({
  // HTTPS (self-signed) is required so phones on the LAN get a SECURE CONTEXT -
  // without it, browsers block navigator.mediaDevices (microphone) and restrict
  // audio. localhost is already secure, but a LAN IP over plain HTTP is not.
  plugins: [react(), basicSsl()],
  server: {
    port: 3000,
    host: true,            // listen on 0.0.0.0 so phones/other devices on the same Wi-Fi can open it
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
