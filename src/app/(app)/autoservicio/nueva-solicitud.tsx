'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
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
  const [abierto, setAbierto] = useState(false)
  const [tipo, setTipo] = useState<'VACACIONES' | 'PERMISO' | 'CERTIFICACION_LABORAL'>('VACACIONES')
  const [campos, setCampos] = useState<Record<string, string>>({})
  const [g, setG] = useState(false)
  const set = (k: string, v: string) => setCampos((p) => ({ ...p, [k]: v }))

  async function enviar() {
    setG(true)
    const res = await crearSolicitud({ tipo, ...campos } as Parameters<typeof crearSolicitud>[0])
    setG(false)
    if (res.ok) { toast.success('Solicitud enviada. Quedó en aprobación.'); setAbierto(false); setCampos({}); router.refresh() }
    else toast.error(res.error)
  }

  return (
    <>
      <Button size="sm" onClick={() => setAbierto(true)}><Plus className="size-4" /> Nueva solicitud</Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva solicitud</DialogTitle>
            <DialogDescription>Será revisada por tu jefe inmediato y Talento Humano.</DialogDescription>
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
                <div className="space-y-1.5"><Label>Fecha</Label><Input type="date" onChange={(e) => set('fechaInicio', e.target.value)} /></div>
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
