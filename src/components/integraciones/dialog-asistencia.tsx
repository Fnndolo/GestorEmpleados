'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Eye, EyeOff, Unplug } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { conectarAsistencia, desconectarAsistencia } from '@/app/(app)/configuracion/integraciones/acciones'

/**
 * Pegar (o cambiar, o quitar) la clave de API de AsistencIA. Solo la usa el
 * administrador, desde Ajustes → Integraciones: la clave es un secreto de la
 * empresa y no debe vivir en una pantalla de operación.
 */
export function DialogConectarAsistencia({ conectada, url, onClose, onDone }: {
  conectada: boolean; url: string | null; onClose: () => void; onDone: () => void
}) {
  const [clave, setClave] = useState('')
  const [ver, setVer] = useState(false)
  const [otraUrl, setOtraUrl] = useState(Boolean(url && !url.includes('arrivecontrol.vercel.app')))
  const [urlPropia, setUrlPropia] = useState(url && !url.includes('arrivecontrol.vercel.app') ? url : '')
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    if (clave.trim().length < 8) { toast.error('Pega la clave completa.'); return }
    setGuardando(true)
    const res = await conectarAsistencia({ clave: clave.trim(), url: otraUrl ? urlPropia.trim() : '' })
    setGuardando(false)
    if (!res.ok) { toast.error(res.error, { duration: 8000 }); return }
    toast.success('AsistencIA conectada.')
    onDone()
  }

  async function desconectar() {
    if (!confirm('¿Desconectar AsistencIA? La nómina liquidará sin horas de marcaciones hasta que vuelvas a conectarla.')) return
    setGuardando(true)
    const res = await desconectarAsistencia({})
    setGuardando(false)
    if (!res.ok) { toast.error(res.error); return }
    toast.success('AsistencIA desconectada.')
    onDone()
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{conectada ? 'Cambiar la clave de AsistencIA' : 'Conectar AsistencIA'}</DialogTitle>
          <DialogDescription>En AsistencIA: Ajustes → Mi empresa → Clave de API. Cópiala y pégala aquí; se prueba antes de guardarla.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="asist-clave">Clave de API</Label>
            <div className="flex gap-2">
              <Input id="asist-clave" type={ver ? 'text' : 'password'} value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="off" spellCheck={false} autoFocus />
              <Button type="button" size="icon" variant="ghost" onClick={() => setVer((v) => !v)} aria-label={ver ? 'Ocultar' : 'Mostrar'}>
                {ver ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
            </div>
          </div>
          {otraUrl ? (
            <div className="space-y-1.5">
              <Label htmlFor="asist-url">Dirección de AsistencIA</Label>
              <Input id="asist-url" value={urlPropia} onChange={(e) => setUrlPropia(e.target.value)} placeholder="https://arrivecontrol.vercel.app" />
            </div>
          ) : (
            <button type="button" className="text-xs text-muted-foreground underline underline-offset-2" onClick={() => setOtraUrl(true)}>
              Usar otra dirección (solo instalaciones propias)
            </button>
          )}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {conectada ? (
            <Button type="button" variant="ghost" onClick={desconectar} disabled={guardando} className="text-rose-700 dark:text-rose-400">
              <Unplug className="size-4" /> Desconectar
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={guardando}>Cancelar</Button>
            <Button type="button" onClick={guardar} disabled={guardando}>{guardando && <Spinner />} {conectada ? 'Guardar' : 'Conectar'}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
