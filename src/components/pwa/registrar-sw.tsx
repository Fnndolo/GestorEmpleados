'use client'

import { useEffect } from 'react'

export function RegistrarSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* registro fallido: la app sigue funcionando sin PWA */
      })
    }
  }, [])
  return null
}
