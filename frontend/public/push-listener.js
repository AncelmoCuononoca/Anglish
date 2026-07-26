// Web Push handlers, imported into the Workbox-generated service worker via
// `workbox.importScripts` in vite.config.ts. Kept separate so the existing
// precache/offline behaviour of the generated SW stays untouched.

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (_e) {
    data = { body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'Anglish Me'
  const options = {
    body: data.body || '',
    icon: data.icon || '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: data.tag || 'anglish-reminder',
    renotify: true,
    data: { url: data.url || '/dashboard' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/dashboard'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus an already-open Anglish Me window if there is one…
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(target)
          return client.focus()
        }
      }
      // …otherwise open a new one (this is what launches the installed PWA).
      if (self.clients.openWindow) return self.clients.openWindow(target)
    })
  )
})
