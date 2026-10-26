'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SelectorColaborador } from '@/components/colaboradores/selector-colaborador'
import { BotonEditar } from '@/components/contratos/dialog-anular'
import { editarContratoOps } from '../../ops-acciones'

export type DatosOpsEditables = {
  contratoId: string
  numero: string
  objeto: string
  valorTotal: number
  valorMensual: number | null
  supervisorId: string
  cargoId: string
  sedeId: string
  fechaInicio: string
  fechaFin: string
  rut: string
}

const NINGUNO = '__ninguno__'

/**
 * El lápiz del contrato OPS: corrige los datos estructurados del alta mientras
 * nadie haya firmado y no haya cuentas de cobro. Firmado, el botón se ve pero
 * explica que los cambios van por otrosí o por un contrato nuevo.
 */
export function EditarContratoOps({ datos, motivoBloqueo, sedes, cargos }: {
  datos: DatosOpsEditables
  motivoBloqueo: string | null
  sedes: { id: string; nombre: string; ciudad: string }[]
  cargos: { id: string; nombre: string }[]
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [f, setF] = useState({
    ...datos,
    valorTotal: String(datos.valorTotal),
    valorMensual: datos.valorMensual != null ? String(datos.valorMensual) : '',
  })
  const [g, setG] = useState(false)
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }))

  async function guardar() {
    setG(true)
    const res = await editarContratoOps({
      contratoId: datos.contratoId,
      numero: f.numero, objeto: f.objeto,
      valorTotal: Number(f.valorTotal), valorMensual: f.valorMensual ? Number(f.valorMensual) : undefined,
      supervisorId: f.supervisorId, cargoId: f.cargoId, sedeId: f.sedeId,
      fechaInicio: f.fechaInicio, fechaFin: f.fechaFin, rut: f.rut,
    })
    setG(false)
    if (!res.ok) { toast.error(res.error, { duration: 9000 }); return }
    toast.success(res.datos.regenerarPdf
      ? 'Contrato actualizado. El PDF conserva los valores anteriores: regenéralo desde Documentos.'
      : 'Contrato actualizado.', { duration: res.datos.regenerarPdf ? 9000 : 4000 })
    setAbierto(false)
    router.refresh()
  }

  return (
    <>
      <BotonEditar onClick={() => setAbierto(true)} motivoBloqueo={motivoBloqueo} etiqueta="Editar datos del contrato" />
      {abierto && (
        <Dialog open onOpenChange={(o) => !o && !g && setAbierto(false)}>
          <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Editar contrato {datos.numero}</DialogTitle>
              <DialogDescription>
                Solo los datos del registro. Si el PDF se generó desde la plantilla, hay que regenerarlo después para que diga lo mismo.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="eo-numero">Número</Label><Input id="eo-numero" value={f.numero} onChange={(e) => set('numero', e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="eo-rut">RUT</Label><Input id="eo-rut" value={f.rut} onChange={(e) => set('rut', e.target.value)} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="eo-objeto">Objeto <span className="text-destructive">*</span></Label><Textarea id="eo-objeto" rows={3} spellCheck lang="es" value={f.objeto} onChange={(e) => set('objeto', e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="eo-total">Valor total <span className="text-destructive">*</span></Label><Input id="eo-total" type="number" value={f.valorTotal} onChange={(e) => set('valorTotal', e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="eo-mensual">Honorario mensual</Label><Input id="eo-mensual" type="number" value={f.valorMensual} onChange={(e) => set('valorMensual', e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="eo-inicio">Fecha de inicio <span className="text-destructive">*</span></Label><Input id="eo-inicio" type="date" value={f.fechaInicio} onChange={(e) => set('fechaInicio', e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="eo-fin">Fecha de fin <span className="text-destructive">*</span></Label><Input id="eo-fin" type="date" value={f.fechaFin} onChange={(e) => set('fechaFin', e.target.value)} /></div>
              <div className="space-y-1.5">
                <Label>Sede <span className="text-destructive">*</span></Label>
                <Select value={f.sedeId} onValueChange={(v) => set('sedeId', v)}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                  <SelectContent>{sedes.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre} · {s.ciudad}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Cargo</Label>
                <Select value={f.cargoId || NINGUNO} onValueChange={(v) => set('cargoId', v === NINGUNO ? '' : v)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NINGUNO}>Sin cargo</SelectItem>
                    {cargos.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Supervisor</Label>
                <SelectorColaborador value={f.supervisorId} onChange={(id) => set('supervisorId', id)} placeholder="Selecciona…" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setAbierto(false)} disabled={g}>Cancelar</Button>
              <Button onClick={guardar} disabled={g || !f.objeto.trim() || !f.valorTotal || !f.fechaInicio || !f.fechaFin || !f.sedeId}>{g && <Spinner />}Guardar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
