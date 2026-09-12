'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Cake, Upload, CircleCheck, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Pill } from '@/components/ui-kit'
import { ZonaArchivos, SoportesLista, subirArchivoEntidad, type SoporteDoc } from '@/app/(app)/juridica/_ui'
import { fmtCOP } from '@/lib/moneda'
import { entregarFacturasCumpleanos } from '@/app/(app)/cumpleanos/acciones'

export type CumpleanosACargoItem = {
  id: string
  homenajeado: string
  fecha: string
  esHoy: boolean
  estado: 'ASIGNADA' | 'FACTURAS_ENTREGADAS' | 'CERRADA'
  nota: string | null
  motivoDevolucion: string | null
  valorReportado: number | null
  facturas: SoporteDoc[]
}

/**
 * Los cumpleaños que Talento Humano le encargó a esta persona. Después de la
 * celebración sube las facturas (varias: PDF o fotos) y anota lo que gastó; si
 * TH las devuelve, ve el motivo y vuelve a subir. No hay plazo: se entrega
 * cuando esté listo.
 */
export function CumpleanosACargo({ items }: { items: CumpleanosACargoItem[] }) {
  return (
    <div className="space-y-3">
      {items.map((c) => <Celebracion key={c.id} c={c} />)}
    </div>
  )
}

function Celebracion({ c }: { c: CumpleanosACargoItem }) {
  const router = useRouter()
  const [archivos, setArchivos] = useState<File[]>([])
  const [valor, setValor] = useState(c.valorReportado != null ? String(c.valorReportado) : '')
  const [enviando, setEnviando] = useState(false)

  async function entregar() {
    // Se acepta entregar sin archivos nuevos si ya había subidos (p. ej. tras una devolución por el valor).
    if (archivos.length === 0 && c.facturas.length === 0) { toast.error('Adjunta al menos una factura.'); return }
    setEnviando(true)
    try {
      for (const file of archivos) await subirArchivoEntidad('CelebracionCumpleanos', c.id, file, `Factura — ${file.name}`)
      const res = await entregarFacturasCumpleanos({ id: c.id, valorTotal: valor ? Number(valor) : undefined })
      if (!res.ok) throw new Error(res.error)
      toast.success('Facturas entregadas. Talento Humano las revisará.')
      setArchivos([])
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudieron entregar las facturas.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Card><CardContent className="space-y-3 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-rose-500/12 text-rose-600 dark:text-rose-400">
            <Cake className="size-[19px]" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">Cumpleaños de {c.homenajeado}</p>
            <p className="text-xs text-muted-foreground">{c.esHoy ? 'Hoy' : c.fecha}</p>
            {c.nota && <p className="mt-1 text-xs"><span className="text-muted-foreground">Indicaciones:</span> {c.nota}</p>}
          </div>
        </div>
        {c.estado === 'ASIGNADA' && <Pill tone={c.motivoDevolucion ? 'bad' : 'info'}>{c.motivoDevolucion ? 'Facturas devueltas' : 'Facturas pendientes'}</Pill>}
        {c.estado === 'FACTURAS_ENTREGADAS' && <Pill tone="warn">En revisión</Pill>}
        {c.estado === 'CERRADA' && <Pill tone="ok">Facturas aceptadas</Pill>}
      </div>

      {c.estado === 'ASIGNADA' && c.motivoDevolucion && (
        <p className="rounded-lg border border-rose-500/40 bg-rose-500/5 px-3 py-2 text-xs">
          <span className="font-medium">Talento Humano las devolvió:</span> {c.motivoDevolucion}
        </p>
      )}

      {c.facturas.length > 0 && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Facturas subidas</p>
          <SoportesLista documentos={c.facturas} />
        </div>
      )}

      {c.estado === 'ASIGNADA' ? (
        <div className="space-y-3 border-t pt-3">
          <p className="text-xs text-muted-foreground">Cuando pase la celebración, sube las facturas de lo que compraste (PDF o fotos) y anota el total.</p>
          <ZonaArchivos archivos={archivos} onChange={setArchivos} />
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1 space-y-1.5 sm:max-w-xs">
              <Label>Valor total gastado (opcional)</Label>
              <Input type="number" min={0} step="1" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0" />
            </div>
            <Button onClick={entregar} disabled={enviando} className="ml-auto">
              {enviando ? <Spinner className="size-4" /> : <Upload className="size-4" />} Entregar facturas
            </Button>
          </div>
        </div>
      ) : (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {c.estado === 'CERRADA' ? <CircleCheck className="size-3.5 text-emerald-600" /> : <Clock className="size-3.5" />}
          {c.valorReportado != null ? `Reportaste ${fmtCOP(c.valorReportado)}. ` : ''}
          {c.estado === 'CERRADA' ? 'Talento Humano aceptó las facturas. Gracias por organizarlo.' : 'Talento Humano está revisando las facturas.'}
        </p>
      )}
    </CardContent></Card>
  )
}
