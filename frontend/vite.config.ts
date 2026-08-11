import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // HTTPS (self-signed) is required so phones on the LAN get a SECURE CONTEXT -
  // without it, browsers block navigator.mediaDevices (microphone) and restrict
  // audio. localhost is already secure, but a LAN IP over plain HTTP is not.
  plugins: [
    react(),
    basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'mascot/logo.png'],
      manifest: {
        name: 'Anglish Me - Master English',
        short_name: 'Anglish Me',
        description: 'Learn English with AI-powered conversations, voice practice, and gamified lessons.',
        theme_color: '#0D1B2A',
        background_color: '#0D1B2A',
        display: 'standalone',
        orientation: 'portrait',
        // Installed app opens straight into the app shell (→ /dashboard if the
        // session is still valid, → /auth if not) instead of the marketing page.
        start_url: '/dashboard',
        scope: '/',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Deep-link capture: tell the browser that when the app is installed, it
        // should OPEN IN THE APP (not a browser tab) for any in-scope link — e.g. a
        // shared https://anglishme.com/lessons/:id. `navigate-existing` reuses the
        // already-open app window and navigates it to the lesson; falls back to a
        // fresh launch when nothing is open. (Android/Chrome; iOS home-screen apps
        // don't support link capture — that's an Apple limitation.)
        ...({
          handle_links: 'preferred',
          launch_handler: { client_mode: ['navigate-existing', 'auto'] },
        } as Record<string, unknown>),
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // Adds Web Push + notification-click handlers to the generated SW
        // without changing its precache/offline behaviour.
        importScripts: ['/push-listener.js'],
        // Don't cache API calls - always hit the network for backend/auth data
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            urlPattern: /^\/api\//,
            handler: 'NetworkOnly',
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
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
