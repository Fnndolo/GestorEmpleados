// Service worker de la PWA — Smart Gadgets RH
// Estrategia: shell estático en caché; navegación network-first con fallback a
// /offline; los datos sensibles y documentos NUNCA se cachean (Ley 1581, C19/R17).

const VERSION = 'sg-rh-v1'
const SHELL = ['/offline', '/icono.svg', '/manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)))
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

self.addEventListener('fetch', (event) => {
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
