'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { BellRing, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

/**
 * Banner que invita a activar las notificaciones push del dispositivo. Aparece
 * cuando el navegador las soporta pero aún no hay suscripción y el permiso no está
 * bloqueado. Ideal tras instalar la PWA en el móvil. El permiso solo se pide al
 * pulsar el botón (los navegadores exigen un gesto del usuario).
 */

function base64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

const OCULTO_KEY = 'sg-banner-push-oculto'

export function BannerPush() {
  const [mostrar, setMostrar] = useState(false)
  const [trabajando, setTrabajando] = useState(false)

  useEffect(() => {
    async function revisar() {
      if (sessionStorage.getItem(OCULTO_KEY)) return
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return
      if (Notification.permission === 'denied') return
      try {
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        if (!sub) setMostrar(true) // soportado, sin suscripción → invitar
      } catch {
        /* sin service worker aún */
      }
    }
    revisar()
  }, [])

  async function activar() {
    const clave = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!clave) {
      toast.error('Notificaciones push no configuradas en el servidor.')
      return
    }
    setTrabajando(true)
    try {
      const permiso = await Notification.requestPermission()
      if (permiso !== 'granted') {
        toast.error('No se otorgó el permiso de notificaciones.')
        return
      }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToUint8Array(clave) as BufferSource,
      })
      const resp = await fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      })
      if (!resp.ok) throw new Error(`El servidor rechazó la suscripción (HTTP ${resp.status})`)
      toast.success('Notificaciones activadas en este dispositivo.')
      setMostrar(false)
    } catch (e) {
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
      console.error('[push] activar (banner) falló:', e)
      toast.error(`No se activaron: ${msg}`)
    } finally {
      setTrabajando(false)
    }
  }

  function ocultar() {
    sessionStorage.setItem(OCULTO_KEY, '1')
    setMostrar(false)
  }

  if (!mostrar) return null

  return (
    <div className="mb-4 flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <BellRing className="size-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Activa las notificaciones</p>
        <p className="text-xs text-muted-foreground">
          Recibe los avisos en este dispositivo, incluso con la app cerrada.
        </p>
      </div>
      <Button size="sm" onClick={activar} disabled={trabajando}>
        {trabajando ? <Spinner /> : <BellRing className="size-4" />} Activar
      </Button>
      <Button variant="ghost" size="icon" aria-label="Ahora no" onClick={ocultar} className="shrink-0">
        <X className="size-4" />
      </Button>
    </div>
  )
}
