'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Send } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { enviarAvisoBroadcast } from './acciones'

/**
 * Envía un aviso a TODOS los empleados (in-app + push). Sirve para verificar que
 * las notificaciones llegan, en especial la del celular. Sin correo.
 *
 * Es una herramienta de prueba, así que vive detrás de un botón del encabezado
 * y no ocupa la pantalla antes de los interruptores, que es a lo que se viene.
 */
export function BroadcastPrueba() {
  const [abierto, setAbierto] = useState(false)
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
      setAbierto(false)
    } else {
      toast.error(res.error ?? 'No se pudo enviar el aviso.')
    }
  }

  return (
    <>
      <Button
        size="sm" variant="outline" onClick={() => setAbierto(true)}
        aria-label="Enviar aviso de prueba a todos" title="Enviar aviso de prueba a todos"
        className="max-sm:size-8 max-sm:px-0"
      >
        <Send className="size-4" /> <span className="max-sm:sr-only">Aviso de prueba</span>
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aviso a todos (prueba)</DialogTitle>
            <DialogDescription>A todos los activos, sin correo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="bc-titulo">Título <span className="text-destructive">*</span></Label>
              <Input id="bc-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bc-mensaje">Mensaje <span className="text-destructive">*</span></Label>
              <Textarea id="bc-mensaje" value={mensaje} onChange={(e) => setMensaje(e.target.value)} maxLength={400} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button onClick={enviar} disabled={g || titulo.trim().length < 2 || mensaje.trim().length < 2}>
              {g ? <Spinner /> : <Send className="size-4" />} Enviar a todos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
