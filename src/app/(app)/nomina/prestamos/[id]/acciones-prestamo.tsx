'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Ban, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { fmtCOP } from '@/lib/moneda'
import { editarPrestamo, anularPrestamo } from '../../acciones'
import { DialogMotivo } from '../../dialog-motivo'

const obligatorio = <span className="text-destructive">*</span>

export type PrestamoEditable = {
  id: string
  colaborador: string
  descripcion: string
  valorTotal: number
  numeroCuotas: number
  /** Mes de inicio como «2026-10». */
  mesInicio: string
  /** Ya se descontó alguna cuota en nómina: no se cambia ni se anula. */
  conCuotasPagadas: boolean
  /** El acuerdo ya lo firmó el colaborador: no se cambia ni se anula. */
  firmado: boolean
  /** El colaborador tiene el acuerdo por firmar: al anular se le avisa. */
  porFirmar: boolean
}

/**
 * Corregir o anular un descuento registrado por error, desde su detalle. Los
 * botones siempre se ven; cuando algo lo impide (cuotas ya descontadas, acuerdo
 * firmado) el título lo explica y la acción lo vuelve a decir.
 */
export function AccionesPrestamo({ prestamo, puedeEditar, puedeEliminar }: { prestamo: PrestamoEditable; puedeEditar: boolean; puedeEliminar: boolean }) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [anulando, setAnulando] = useState(false)
  if (!puedeEditar && !puedeEliminar) return null

  const bloqueo = prestamo.conCuotasPagadas
    ? 'Ya se descontaron cuotas en nómina: no se puede cambiar ni anular.'
    : prestamo.firmado
      ? 'El acuerdo ya está firmado por el colaborador: no se puede cambiar ni anular.'
      : null

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {puedeEditar && (
        <Button size="sm" variant="outline" onClick={() => setEditando(true)} title={bloqueo ?? 'Corregir el descuento'}>
          <Pencil className="size-4" /> Editar
        </Button>
      )}
      {puedeEliminar && (
        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setAnulando(true)} title={bloqueo ?? 'Anular el descuento'}>
          <Ban className="size-4" /> Anular
        </Button>
      )}
      {editando && <DialogEditarPrestamo prestamo={prestamo} onClose={() => setEditando(false)} />}
      {anulando && (
        <DialogMotivo
          titulo="Anular descuento"
          detalle={`${prestamo.colaborador} · ${prestamo.descripcion} · ${fmtCOP(prestamo.valorTotal)} en ${prestamo.numeroCuotas} cuota(s). Se borra con sus cuotas y el acuerdo adjunto.${prestamo.porFirmar ? ' · se le avisa al colaborador que ya no debe firmar el acuerdo' : ''}`}
          exito="Descuento anulado."
          confirmar={(motivo) => anularPrestamo({ prestamoId: prestamo.id, motivo })}
          onClose={() => setAnulando(false)}
          // El detalle ya no existe: se vuelve a la lista.
          onOk={() => router.push('/nomina/prestamos')}
        />
      )}
    </div>
  )
}

function DialogEditarPrestamo({ prestamo, onClose }: { prestamo: PrestamoEditable; onClose: () => void }) {
  const router = useRouter()
  const [asunto, setAsunto] = useState(prestamo.descripcion)
  const [valorTotal, setValorTotal] = useState(String(Math.round(prestamo.valorTotal)))
  const [numeroCuotas, setNumeroCuotas] = useState(String(prestamo.numeroCuotas))
  const [mesInicio, setMesInicio] = useState(prestamo.mesInicio)
  const [g, setG] = useState(false)
  const cuota = valorTotal && Number(numeroCuotas) > 0 ? Math.round(Number(valorTotal) / Number(numeroCuotas)) : 0

  async function guardar() {
    if (asunto.trim().length < 3) { toast.error('Escribe el asunto del descuento.'); return }
    setG(true)
    const res = await editarPrestamo({ prestamoId: prestamo.id, valorTotal: Number(valorTotal), numeroCuotas: Number(numeroCuotas), mesInicio, descripcion: asunto.trim() })
    setG(false)
    if (!res.ok) { toast.error(res.error); return }
    toast.success('Descuento actualizado. El plan de cuotas se rehizo.')
    onClose(); router.refresh()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !g && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>Editar descuento · {prestamo.colaborador}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edesc-asunto">Asunto del descuento {obligatorio}</Label>
            <Input id="edesc-asunto" value={asunto} maxLength={300} onChange={(e) => setAsunto(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="edesc-valor">Valor total {obligatorio}</Label><Input id="edesc-valor" type="number" inputMode="numeric" value={valorTotal} onChange={(e) => setValorTotal(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="edesc-cuotas">Número de cuotas {obligatorio}</Label><Input id="edesc-cuotas" type="number" inputMode="numeric" value={numeroCuotas} onChange={(e) => setNumeroCuotas(e.target.value)} /></div>
          </div>
          {cuota > 0 && <p className="text-sm text-muted-foreground">Cuota mensual: <b>{fmtCOP(cuota)}</b></p>}
          <div className="space-y-1.5">
            <Label htmlFor="edesc-mes">Mes en que empieza a descontarse {obligatorio}</Label>
            <Input id="edesc-mes" type="month" value={mesInicio} onChange={(e) => setMesInicio(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">El plan de cuotas se rehace desde cero: los ajustes acordados cuota a cuota se pierden.</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={g}>Cancelar</Button>
          <Button onClick={guardar} disabled={g || !valorTotal || !numeroCuotas || !mesInicio}>{g && <Spinner />}Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
