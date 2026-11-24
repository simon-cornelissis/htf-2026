self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { title: 'Critical Achrona alert', body: 'Open the notifications panel.' }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Critical Achrona alert', {
      body: payload.body || 'A critical incident needs attention.',
      tag: payload.eventKey || undefined,
      data: { url: payload.url || '/notifications' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const requestedUrl = new URL(event.notification.data?.url || '/notifications', self.location.origin)
  const targetUrl = requestedUrl.origin === self.location.origin ? requestedUrl.href : `${self.location.origin}/notifications`

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      for (const client of windows) {
        if ('focus' in client && 'navigate' in client) {
          await client.navigate(targetUrl)
          return client.focus()
        }
      }
      return self.clients.openWindow(targetUrl)
    }),
  )
})
