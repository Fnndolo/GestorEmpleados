'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Paperclip } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { crearSolicitud } from './acciones'

export function NuevaSolicitud() {
  const router = useRouter()
  const inputArchivo = useRef<HTMLInputElement>(null)
  const [abierto, setAbierto] = useState(false)
  const [tipo, setTipo] = useState<'VACACIONES' | 'PERMISO' | 'CERTIFICACION_LABORAL'>('VACACIONES')
  const [campos, setCampos] = useState<Record<string, string>>({})
  const [archivo, setArchivo] = useState<File | null>(null)
  const [g, setG] = useState(false)
  const set = (k: string, v: string) => setCampos((p) => ({ ...p, [k]: v }))

  async function enviar() {
    setG(true)
    const res = await crearSolicitud({ tipo, ...campos } as Parameters<typeof crearSolicitud>[0])
    if (!res.ok) { setG(false); toast.error(res.error); return }
    // Si adjuntó un archivo, lo sube vinculado a la solicitud
    if (archivo) {
      try {
        const fd = new FormData()
        fd.append('archivo', archivo)
        fd.append('entidadTipo', 'Solicitud')
        fd.append('entidadId', (res.datos as { id: string }).id)
        fd.append('nombre', `Soporte solicitud — ${archivo.name}`)
        await fetch('/api/documentos/subir', { method: 'POST', body: fd })
      } catch { /* el soporte es opcional */ }
    }
    setG(false)
    toast.success('Solicitud enviada. Quedó en aprobación de tu jefe inmediato.')
    setAbierto(false); setCampos({}); setArchivo(null); router.refresh()
  }

  const permiteAdjunto = tipo === 'PERMISO' || tipo === 'VACACIONES'

  return (
    <>
      <Button size="sm" onClick={() => setAbierto(true)}><Plus className="size-4" /> Nueva solicitud</Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva solicitud</DialogTitle>
            <DialogDescription>La revisa primero tu jefe inmediato y luego Talento Humano. Recibirás notificaciones en cada paso.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Tipo de solicitud</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as 'VACACIONES')}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="VACACIONES">Vacaciones</SelectItem>
                  <SelectItem value="PERMISO">Permiso</SelectItem>
                  <SelectItem value="CERTIFICACION_LABORAL">Certificación laboral</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {tipo === 'VACACIONES' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Desde</Label><Input type="date" onChange={(e) => set('fechaInicio', e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Hasta</Label><Input type="date" onChange={(e) => set('fechaFin', e.target.value)} /></div>
              </div>
            )}
            {tipo === 'PERMISO' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Desde</Label><Input type="date" onChange={(e) => set('fechaInicio', e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>Hasta (opcional)</Label><Input type="date" onChange={(e) => set('fechaFin', e.target.value)} /></div>
                </div>
                <div className="space-y-1.5"><Label>Motivo</Label><Textarea rows={2} onChange={(e) => set('motivo', e.target.value)} /></div>
              </>
            )}
            {tipo === 'CERTIFICACION_LABORAL' && (
              <>
                <div className="space-y-1.5">
                  <Label>Tipo de certificación</Label>
                  <Select onValueChange={(v) => set('tipoCertificacion', v)}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SIMPLE">Simple (cargo y fechas)</SelectItem>
                      <SelectItem value="CON_SALARIO">Con salario</SelectItem>
                      <SelectItem value="CON_FUNCIONES">Con funciones</SelectItem>
                      <SelectItem value="ENTIDAD_FINANCIERA">Para entidad financiera</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Dirigida a (opcional)</Label><Input onChange={(e) => set('dirigidaA', e.target.value)} placeholder="Banco, entidad…" /></div>
              </>
            )}

            {permiteAdjunto && (
              <div className="space-y-1.5">
                <Label>Soporte (opcional)</Label>
                <input ref={inputArchivo} type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
                <Button type="button" variant="outline" size="sm" className="w-full justify-start" onClick={() => inputArchivo.current?.click()}>
                  <Paperclip className="size-4" /> {archivo ? archivo.name : 'Adjuntar imagen o PDF'}
                </Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button onClick={enviar} disabled={g}>{g && <Spinner />}Enviar solicitud</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
