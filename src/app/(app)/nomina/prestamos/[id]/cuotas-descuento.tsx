'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, Clock, Pencil } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Pill } from '@/components/ui-kit'
import { fmtCOP } from '@/lib/moneda'
import { ajustarCuotaDescuento } from '../../acciones'

export type CuotaItem = {
  id: string
  numero: number
  /** Lo pagado si ya se descontó; si no, lo que se va a descontar (acordado o del plan). */
  valor: number
  pagada: boolean
  fechaPago: string | null
  /** Se acordó un valor distinto al del plan. */
  ajustada: boolean
}

/**
 * Cuotas del descuento. Las pendientes se pueden ajustar antes de la nómina:
 * se le pregunta a la persona y puede pagar más, menos o nada ese mes.
 */
export function CuotasDescuento({ prestamoId, cuotas, saldo, puedeAjustar }: {
  prestamoId: string
  cuotas: CuotaItem[]
  saldo: number
  puedeAjustar: boolean
}) {
  const [editando, setEditando] = useState<{ cuotaId: string | null; numero: number; valor: number } | null>(null)
  const pendientes = cuotas.filter((c) => !c.pagada)
  // Sin cuotas pendientes pero con saldo (se pagó menos): la próxima la agrega la
  // nómina sola; aquí se puede acordar desde ya cuánto será.
  const proximaExtra = puedeAjustar && saldo > 0 && pendientes.length === 0

  return (
    <>
      <Card><CardContent className="p-0 divide-y">
        {cuotas.map((c) => (
          <div key={c.id} className="flex items-center gap-3 p-3">
            <div className={`flex size-8 shrink-0 items-center justify-center rounded-full ${c.pagada ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
              {c.pagada ? <Check className="size-4" /> : <Clock className="size-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-medium">
                Cuota {c.numero}
                {c.ajustada && <Pill tone="info">Ajustada</Pill>}
              </p>
              <p className="text-xs text-muted-foreground">
                {c.pagada ? `Pagada${c.fechaPago ? ` · ${c.fechaPago}` : ''}` : c.valor === 0 && c.ajustada ? 'Ese mes no se descuenta' : 'Pendiente'}
              </p>
            </div>
            <p className="text-sm tabular-nums">{fmtCOP(c.valor)}</p>
            {puedeAjustar && !c.pagada && (
              <Button size="icon" variant="ghost" className="size-8" aria-label={`Ajustar la cuota ${c.numero}`} title="Ajustar lo que se descuenta"
                onClick={() => setEditando({ cuotaId: c.id, numero: c.numero, valor: c.valor })}>
                <Pencil className="size-4" />
              </Button>
            )}
          </div>
        ))}
        {proximaExtra && (
          <div className="flex items-center gap-3 p-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"><Clock className="size-4" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Cuota {cuotas.length + 1}</p>
              <p className="text-xs text-muted-foreground">Queda saldo: la nómina la agrega sola con el valor del plan</p>
            </div>
            <Button size="icon" variant="ghost" className="size-8" aria-label="Ajustar la próxima cuota" title="Ajustar lo que se descuenta"
              onClick={() => setEditando({ cuotaId: null, numero: cuotas.length + 1, valor: Math.min(saldo, cuotas[0]?.valor ?? saldo) })}>
              <Pencil className="size-4" />
            </Button>
          </div>
        )}
      </CardContent></Card>
      {editando && <DialogAjuste prestamoId={prestamoId} saldo={saldo} {...editando} onClose={() => setEditando(null)} />}
    </>
  )
}

function DialogAjuste({ prestamoId, cuotaId, numero, valor, saldo, onClose }: {
  prestamoId: string; cuotaId: string | null; numero: number; valor: number; saldo: number; onClose: () => void
}) {
  const router = useRouter()
  const [texto, setTexto] = useState(String(Math.round(valor)))
  const [g, setG] = useState(false)
  const monto = Number(texto.replace(/\D/g, '') || '0')

  async function guardar() {
    setG(true)
    const res = await ajustarCuotaDescuento({ prestamoId, cuotaId, valor: monto })
    setG(false)
    if (res.ok) { toast.success('Cuota ajustada. Se aplica en la próxima nómina.'); onClose(); router.refresh() } else toast.error(res.error)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !g && onClose()}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader><DialogTitle>Ajustar la cuota {numero}</DialogTitle></DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="cuota-valor">Cuánto se descuenta en esta cuota <span className="text-destructive">*</span></Label>
          <Input id="cuota-valor" inputMode="numeric" value={texto} onChange={(e) => setTexto(e.target.value.replace(/\D/g, ''))} />
          <p className="text-xs text-muted-foreground">
            {fmtCOP(monto)}. Con 0 ese mes no se descuenta. Las cuotas siguientes se recalculan solas para completar el saldo de {fmtCOP(saldo)}.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={g}>Cancelar</Button>
          <Button onClick={guardar} disabled={g || monto > saldo}>{g && <Spinner />}Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
