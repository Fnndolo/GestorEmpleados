'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Calculator, CheckCircle2, Lock, FileText, FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { liquidar, aprobarPeriodo, cerrarPeriodo, generarPdfDesprendibles } from '../acciones'

export function AccionesPeriodo({
  periodoId, estado, tieneLiquidaciones, puedeOperar, puedeAprobar, puedeExportar,
}: {
  periodoId: string; estado: string; tieneLiquidaciones: boolean
  puedeOperar: boolean; puedeAprobar: boolean; puedeExportar: boolean
}) {
  const router = useRouter()
  const [cargando, setCargando] = useState<string | null>(null)

  async function ejecutar(clave: string, fn: () => Promise<{ ok: boolean; error?: string; datos?: unknown }>, exito: string) {
    setCargando(clave)
    const res = await fn()
    setCargando(null)
    if (res.ok) { toast.success(exito); router.refresh() } else toast.error(res.error)
  }

  const editable = estado === 'BORRADOR' || estado === 'CALCULADA'

  return (
    <Card><CardContent className="flex flex-wrap items-center gap-2 py-4">
      {puedeOperar && editable && (
        <Button size="sm" onClick={() => ejecutar('liq', () => liquidar({ periodoId }), 'Periodo liquidado.')} disabled={cargando !== null}>
          {cargando === 'liq' ? <Spinner /> : <Calculator className="size-4" />} {tieneLiquidaciones ? 'Recalcular' : 'Liquidar'}
        </Button>
      )}
      {puedeAprobar && estado === 'CALCULADA' && (
        <Button size="sm" variant="outline" onClick={() => ejecutar('apr', () => aprobarPeriodo({ periodoId }), 'Periodo aprobado.')} disabled={cargando !== null}>
          {cargando === 'apr' ? <Spinner /> : <CheckCircle2 className="size-4" />} Aprobar
        </Button>
      )}
      {puedeAprobar && estado === 'APROBADA' && (
        <Button size="sm" variant="outline" onClick={() => ejecutar('cer', () => cerrarPeriodo({ periodoId }), 'Periodo cerrado.')} disabled={cargando !== null}>
          {cargando === 'cer' ? <Spinner /> : <Lock className="size-4" />} Cerrar
        </Button>
      )}
      {puedeExportar && tieneLiquidaciones && (
        <>
          <Button size="sm" variant="outline" onClick={() => ejecutar('pdf', () => generarPdfDesprendibles({ periodoId }), 'Desprendibles generados.')} disabled={cargando !== null}>
            {cargando === 'pdf' ? <Spinner /> : <FileText className="size-4" />} Desprendibles PDF
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href={`/api/nomina/${periodoId}/pila`}><FileSpreadsheet className="size-4" /> Resumen PILA</a>
          </Button>
        </>
      )}
      {estado === 'CERRADA' && <span className="text-xs text-muted-foreground ml-auto">Periodo cerrado (inmutable). Usa un periodo de ajuste para corregir.</span>}
    </CardContent></Card>
  )
}
