'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Send, Megaphone } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { enviarAvisoBroadcast } from './acciones'

/**
 * Envía un aviso a TODOS los empleados (in-app + push). Sirve para verificar que
 * las notificaciones llegan, en especial la del celular. Sin correo.
 */
export function BroadcastPrueba() {
  const [titulo, setTitulo] = useState('Aviso general de Smart Gadgets')
  const [mensaje, setMensaje] = useState('Este es un aviso de prueba para verificar las notificaciones. Puedes ignorarlo.')
  const [g, setG] = useState(false)

  async function enviar() {
    setG(true)
    const res = await enviarAvisoBroadcast({ titulo, mensaje })
    setG(false)
    if (res.ok) {
      toast.success(`Aviso enviado a ${res.datos.total} ${res.datos.total === 1 ? 'persona' : 'personas'}.`)
      window.dispatchEvent(new Event('sg:refrescar-notifs')) // que a ti te llegue enseguida
    } else {
      toast.error(res.error ?? 'No se pudo enviar el aviso.')
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Megaphone className="size-4 text-primary" /> Enviar aviso a todos (prueba)
        </div>
        <p className="text-xs text-muted-foreground">
          Envía una notificación a todos los empleados activos (aparece en la campana y, en el celular, como
          notificación del sistema si tienen el push activado). No envía correo.
        </p>
        <div className="space-y-1">
          <Label htmlFor="bc-titulo" className="text-xs">Título</Label>
          <Input id="bc-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={120} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="bc-mensaje" className="text-xs">Mensaje</Label>
          <Textarea id="bc-mensaje" value={mensaje} onChange={(e) => setMensaje(e.target.value)} maxLength={400} rows={3} />
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={enviar} disabled={g || titulo.trim().length < 2 || mensaje.trim().length < 2}>
            {g ? <Spinner /> : <Send className="size-4" />} Enviar a todos
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
