'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { BellRing, BellOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

/**
 * Activa/desactiva las notificaciones push de ESTE dispositivo (Web Push).
 * Requiere: permiso del navegador + service worker registrado + claves VAPID.
 * En iPhone/iPad solo funciona con la PWA instalada en la pantalla de inicio (iOS 16.4+).
 */

function base64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

type Estado = 'cargando' | 'no-soportado' | 'bloqueado' | 'inactivo' | 'activo'

export function ActivarPush() {
  const [estado, setEstado] = useState<Estado>('cargando')
  const [trabajando, setTrabajando] = useState(false)

  useEffect(() => {
    async function revisar() {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        setEstado('no-soportado')
        return
      }
      if (Notification.permission === 'denied') { setEstado('bloqueado'); return }
      try {
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        setEstado(sub ? 'activo' : 'inactivo')
      } catch {
        setEstado('inactivo')
      }
    }
    revisar()
  }, [])

  async function activar() {
    const clave = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!clave) { toast.error('Notificaciones push no configuradas en el servidor.'); return }
    setTrabajando(true)
    try {
      const permiso = await Notification.requestPermission()
      if (permiso !== 'granted') {
        setEstado(permiso === 'denied' ? 'bloqueado' : 'inactivo')
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
      setEstado('activo')
      toast.success('Notificaciones activadas en este dispositivo.')
    } catch (e) {
      // Diagnóstico: muestra el error real para saber qué falla.
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
      console.error('[push] activar falló:', e)
      toast.error(`No se activaron: ${msg}`)
    } finally {
      setTrabajando(false)
    }
  }

  async function desactivar() {
    setTrabajando(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) })
        await sub.unsubscribe()
      }
      setEstado('inactivo')
      toast.success('Notificaciones desactivadas en este dispositivo.')
    } catch {
      toast.error('No se pudieron desactivar.')
    } finally {
      setTrabajando(false)
    }
  }

  if (estado === 'cargando' || estado === 'no-soportado') return null
  if (estado === 'bloqueado') {
    return <p className="px-2 py-1 text-center text-[11px] text-muted-foreground">Notificaciones bloqueadas: habilítalas en la configuración del navegador.</p>
  }

  return estado === 'activo' ? (
    <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={desactivar} disabled={trabajando}>
      {trabajando ? <Spinner /> : <BellOff className="size-4" />} Desactivar notificaciones aquí
    </Button>
  ) : (
    <Button variant="outline" size="sm" className="w-full" onClick={activar} disabled={trabajando}>
      {trabajando ? <Spinner /> : <BellRing className="size-4" />} Activar notificaciones en este dispositivo
    </Button>
  )
}
