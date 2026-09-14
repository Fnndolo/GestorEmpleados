'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CircleX, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { enfocarDialogo } from '@/components/ui-kit'
import { cerrarContratoOps } from '../../ops-acciones'

type Motivo = 'VENCIMIENTO_PLAZO' | 'TERMINACION_ANTICIPADA' | 'MUTUO_ACUERDO'

const MOTIVOS: { v: Motivo; l: string; d: string }[] = [
  { v: 'VENCIMIENTO_PLAZO', l: 'Vencimiento del plazo', d: 'Se cumplió la fecha de fin pactada. La fecha de cierre es esa.' },
  { v: 'TERMINACION_ANTICIPADA', l: 'Terminación anticipada', d: 'Una de las partes lo termina antes del plazo.' },
  { v: 'MUTUO_ACUERDO', l: 'Mutuo acuerdo', d: 'Las dos partes acuerdan terminarlo antes del plazo.' },
]

/**
 * «Cerrar contrato» de un OPS. Es el cierre del CONTRATO, no el retiro de la
 * persona: lo normal es que siga con uno nuevo. Retirarla es cosa de
 * Terminaciones. Un contrato cerrado no se reabre: si la relación continúa, el
 * camino es el contrato nuevo.
 */
export function CerrarContratoOps({ contratoId, numero, fechaFin, vencido, hoy, compacto }: {
  contratoId: string
  numero: string
  /** ISO de la fecha de fin pactada. */
  fechaFin: string
  /** La fecha de fin ya pasó: el motivo natural es el vencimiento. */
  vencido: boolean
  /** ISO de hoy en Bogotá: tope de la fecha de cierre. */
  hoy: string
  /** En una fila de lista: botón discreto, solo icono en móvil. */
  compacto?: boolean
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [guardando, empezar] = useTransition()
  const [motivo, setMotivo] = useState<Motivo>(vencido ? 'VENCIMIENTO_PLAZO' : 'TERMINACION_ANTICIPADA')
  const [fecha, setFecha] = useState(hoy)
  const [observacion, setObservacion] = useState('')

  function cerrar() {
    empezar(async () => {
      const res = await cerrarContratoOps({ contratoId, motivo, fechaCierre: motivo === 'VENCIMIENTO_PLAZO' ? '' : fecha, observacion })
      if (!res.ok) { toast.error(res.error); return }
      toast.success(res.datos.accesoRestringido
        ? 'Contrato cerrado. El contratista no tiene otro contrato vigente: su acceso queda en solo consulta.'
        : 'Contrato cerrado.')
      setAbierto(false)
      router.refresh()
    })
  }

  return (
    <>
      {compacto ? (
        <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground" aria-label={`Cerrar contrato ${numero}`} onClick={() => setAbierto(true)}>
          <CircleX className="size-4" /> <span className="hidden sm:inline">Cerrar</span>
        </Button>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setAbierto(true)}>
          <CircleX className="size-4" /> Cerrar contrato
        </Button>
      )}

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent onOpenAutoFocus={enfocarDialogo} className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Cerrar el contrato {numero}</DialogTitle>
            <DialogDescription>
              El contrato pasa a Terminado con fecha y motivo, y su alerta de vencimiento se apaga. No retira al contratista: si sigue prestando servicios, lo que corresponde es un contrato nuevo. Este cierre no se deshace.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Motivo</Label>
              <Select value={motivo} onValueChange={(v) => setMotivo(v as Motivo)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{MOTIVOS.map((m) => <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">{MOTIVOS.find((m) => m.v === motivo)?.d}</p>
            </div>
            {motivo === 'VENCIMIENTO_PLAZO' ? (
              <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                Fecha de cierre: <span className="font-medium">{fechaFin}</span> (la de fin pactada).
                {!vencido && <span className="block text-xs text-destructive">Todavía no ha vencido: para cerrarlo hoy elige terminación anticipada o mutuo acuerdo.</span>}
              </p>
            ) : (
              <div className="space-y-1.5">
                <Label>Fecha de cierre</Label>
                <Input type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Observación (opcional)</Label>
              <Textarea rows={2} value={observacion} onChange={(e) => setObservacion(e.target.value)} placeholder="Se hace contrato nuevo desde el 1 de octubre; entregables recibidos…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button onClick={cerrar} disabled={guardando || (motivo === 'VENCIMIENTO_PLAZO' && !vencido)}>
              {guardando ? <Spinner className="size-4" /> : <Lock className="size-4" />} Cerrar contrato
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
