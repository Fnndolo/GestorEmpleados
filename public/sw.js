// Service worker de la PWA — Smart Gadgets RH
// Estrategia: shell estático en caché; navegación network-first con fallback a
// /offline; los datos sensibles y documentos NUNCA se cachean (Ley 1581, C19/R17).

const VERSION = 'sg-rh-v5'
const SHELL = ['/offline', '/icono.svg', '/manifest.webmanifest']

// En desarrollo se registra como /sw.js?dev=1 → NO se cachea nada: la caché de los
// chunks de Next rompe el hot reload y provoca errores de hidratación (código viejo
// en el cliente). El push sí funciona igual en dev.
const ES_DEV = new URL(self.location.href).searchParams.get('dev') === '1'

self.addEventListener('install', (event) => {
  // Si falla el precacheo, NO debe impedir la instalación (si no, el push nunca arranca).
  if (!ES_DEV) {
    event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).catch(() => {}))
  }
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((claves) =>
      Promise.all(claves.filter((c) => c !== VERSION).map((c) => caches.delete(c))),
    ),
  )
  self.clients.claim()
})

function noCachear(url) {
  return (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/documentos/') ||
    url.pathname.includes('/storage/') ||
    url.search.includes('token=')
  )
}

// ── Web Push: notificaciones aunque la app esté cerrada, o pop-up in-app si está abierta ──
self.addEventListener('push', (event) => {
  let datos = { titulo: 'Smart Gadgets RH', mensaje: 'Tienes una nueva notificación.', enlace: '/' }
  try {
    if (event.data) datos = { ...datos, ...event.data.json() }
  } catch {
    /* payload no JSON: usar valores por defecto */
  }
  // El pop-up in-app (toast) es SOLO para escritorio; en móvil siempre se usa la
  // notificación del sistema (llega aunque la app esté cerrada).
  const esMovil = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(
    self.navigator.userAgent,
  )
  event.waitUntil(
    (async () => {
      const clientes = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const hayVisible = clientes.some((c) => c.visibilityState === 'visible')
      if (hayVisible && !esMovil) {
        // Escritorio con la app a la vista: pop-up in-app (toast) al instante,
        // SIN notificación del sistema (evita el doble aviso).
        for (const c of clientes) {
          c.postMessage({ tipo: 'nueva-notificacion', titulo: datos.titulo, mensaje: datos.mensaje, enlace: datos.enlace })
        }
        return
      }
      // Móvil (siempre), o escritorio con la app cerrada/en segundo plano:
      // notificación del sistema.
      await self.registration.showNotification(datos.titulo, {
        body: datos.mensaje,
        icon: '/icono-192.png',
        badge: '/icono-192.png',
        data: { enlace: datos.enlace },
      })
    })(),
  )
})

// Al tocar la notificación: enfocar una pestaña abierta (y navegar) o abrir una nueva.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const enlace = (event.notification.data && event.notification.data.enlace) || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      for (const v of ventanas) {
        if ('focus' in v) {
          v.focus()
          if ('navigate' in v) v.navigate(enlace)
          return
        }
      }
      return clients.openWindow(enlace)
    }),
  )
})

self.addEventListener('fetch', (event) => {
  if (ES_DEV) return // desarrollo: todo va a la red, sin caché
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (noCachear(url)) return // deja pasar a la red sin tocar caché

  // Navegaciones: network-first, fallback a /offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/offline').then((r) => r ?? Response.error())),
    )
    return
  }

  // Recursos estáticos de Next: cache-first
  if (url.pathname.startsWith('/_next/static/') || SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((resp) => {
            const copia = resp.clone()
            caches.open(VERSION).then((cache) => cache.put(request, copia))
            return resp
          }),
      ),
    )
  }
})
