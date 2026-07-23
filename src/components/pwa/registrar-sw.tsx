'use client'

import { useEffect } from 'react'

export function RegistrarSW() {
  useEffect(() => {
    // Se registra también en desarrollo para poder probar PWA y notificaciones push
    // en local. En dev se pasa ?dev=1 para que el SW NO cachee: la caché de los chunks
    // de Next rompe el hot reload y causa errores de hidratación.
    if ('serviceWorker' in navigator) {
      const url = process.env.NODE_ENV === 'production' ? '/sw.js' : '/sw.js?dev=1'
      navigator.serviceWorker.register(url).catch(() => {
        /* registro fallido: la app sigue funcionando sin PWA */
      })
    }
  }, [])
  return null
}
