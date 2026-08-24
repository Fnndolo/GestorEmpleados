'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { RefreshCw, Trash2, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { recalcularLiquidacion, anularTerminacion } from '../acciones'

/**
 * Rehacer las cifras y anular una terminación registrada por error.
 *
 * Las dos existen porque el cálculo se congela al registrar la terminación: si
 * el salario del contrato estaba mal o la fecha de retiro se digitó mal, esas
 * cifras quedan falsas. Antes tocaba registrar otra terminación y dejar la mala
 * en la base.
 *
 * Ninguna aparece si la terminación ya está cerrada: ahí ya se pagó y se firmó
 * el paz y salvo, y corregir eso es una nota contable.
 */
export function AccionesLiquidacion({ terminacionId, colaborador, fechaRetiro, puedeEditar, puedeEliminar }: {
  terminacionId: string
  colaborador: string
  /** yyyy-mm-dd, para poder corregirla al recalcular. */
  fechaRetiro: string
  puedeEditar: boolean
  puedeEliminar: boolean
}) {
  const router = useRouter()
  const [dialogo, setDialogo] = useState<'recalcular' | 'anular' | null>(null)
  const [fecha, setFecha] = useState(fechaRetiro)
  const [motivo, setMotivo] = useState('')
  const [g, setG] = useState(false)

  async function recalcular() {
    setG(true)
    const res = await recalcularLiquidacion({ id: terminacionId, fechaRetiro: fecha })
    setG(false)
    if (res.ok) {
      toast.success('Liquidación rehecha con los datos actuales.')
      setDialogo(null)
      router.refresh()
    } else toast.error(res.error)
  }

  async function anular() {
    if (motivo.trim().length < 5) { toast.error('Explica por qué se anula.'); return }
    setG(true)
    const res = await anularTerminacion({ id: terminacionId, motivo })
    setG(false)
    if (res.ok) {
      toast.success('Terminación anulada. El colaborador vuelve a estar activo.')
      router.push('/terminaciones')
    } else toast.error(res.error)
  }

  if (!puedeEditar && !puedeEliminar) return null

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {puedeEditar && (
          <Button size="sm" variant="outline" onClick={() => { setFecha(fechaRetiro); setDialogo('recalcular') }}>
            <RefreshCw className="size-4" /> Rehacer el cálculo
          </Button>
        )}
        {puedeEliminar && (
          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => { setMotivo(''); setDialogo('anular') }}>
            <Trash2 className="size-4" /> Anular
          </Button>
        )}
      </div>

      <Dialog open={dialogo === 'recalcular'} onOpenChange={(o) => { if (!g && !o) setDialogo(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rehacer el cálculo</DialogTitle>
            <DialogDescription>
              Se vuelven a calcular cesantías, prima, vacaciones e indemnización con los datos que
              hay hoy: el salario del contrato, los préstamos pendientes y el saldo de vacaciones.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="fecha-recalc">Fecha de retiro</Label>
            <Input id="fecha-recalc" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              De ella salen los días liquidados. Si se digitó mal, corrígela aquí.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" disabled={g} onClick={() => setDialogo(null)}>Cancelar</Button>
            <Button onClick={recalcular} disabled={g}>{g ? <Spinner /> : <RefreshCw className="size-4" />} Rehacer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogo === 'anular'} onOpenChange={(o) => { if (!g && !o) setDialogo(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anular la terminación</DialogTitle>
            <DialogDescription>
              Para cuando se registró por error. <b>{colaborador}</b> vuelve a estar activo y se
              podrá registrar la terminación correcta.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-300">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <p>
              Se eliminan también la liquidación y el paz y salvo de esta terminación. El motivo que
              escribas queda en la auditoría.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="motivo-anular">Motivo</Label>
            <Textarea
              id="motivo-anular" rows={3} value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: se registró con la fecha de retiro equivocada"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" disabled={g} onClick={() => setDialogo(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={anular} disabled={g}>{g ? <Spinner /> : <Trash2 className="size-4" />} Anular</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
