'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Calculator, CircleCheck, Lock, LockOpen, Trash2, FileText, FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { liquidar, aprobarPeriodo, cerrarPeriodo, reabrirPeriodo, eliminarPeriodo, generarPdfDesprendibles } from '../acciones'

export function AccionesPeriodo({
  periodoId, estado, tieneLiquidaciones, puedeOperar, puedeAprobar, puedeExportar,
}: {
  periodoId: string; estado: string; tieneLiquidaciones: boolean
  puedeOperar: boolean; puedeAprobar: boolean; puedeExportar: boolean
}) {
  const router = useRouter()
  const [cargando, setCargando] = useState<string | null>(null)
  const [confirmar, setConfirmar] = useState<'reabrir' | 'eliminar' | null>(null)

  async function ejecutar(clave: string, fn: () => Promise<{ ok: boolean; error?: string; datos?: unknown }>, exito: string) {
    setCargando(clave)
    const res = await fn()
    setCargando(null)
    if (!res.ok) { toast.error(res.error); return }
    toast.success(exito)
    // La nómina se liquidó, pero con horas de asistencia que no se pudieron
    // actualizar: se dice, porque si alguien corrigió una marcación en el otro
    // sistema, esas correcciones no entraron en este cálculo.
    const sinRefrescar = (res.datos as { horasSinRefrescar?: number } | undefined)?.horasSinRefrescar ?? 0
    if (sinRefrescar > 0) {
      toast.warning(
        `Se liquidó con ${sinRefrescar} registro(s) de horas del sistema de asistencia sin actualizar: no está configurado. Si hubo cambios en las marcaciones, no entraron en este cálculo.`,
        { duration: 10000 },
      )
    }
    router.refresh()
  }

  const editable = estado === 'BORRADOR' || estado === 'CALCULADA'
  // Reabrir: cualquier estado ya avanzado, salvo PAGADA (esa se corrige con un ajuste).
  const puedeReabrir = estado === 'CALCULADA' || estado === 'APROBADA' || estado === 'CERRADA'

  return (
    <Card><CardContent className="flex flex-wrap items-center gap-2 py-4">
      {puedeOperar && editable && (
        <Button size="sm" onClick={() => ejecutar('liq', () => liquidar({ periodoId }), 'Periodo liquidado.')} disabled={cargando !== null}>
          {cargando === 'liq' ? <Spinner /> : <Calculator className="size-4" />} {tieneLiquidaciones ? 'Recalcular' : 'Liquidar'}
        </Button>
      )}
      {puedeAprobar && estado === 'CALCULADA' && (
        <Button size="sm" variant="outline" onClick={() => ejecutar('apr', () => aprobarPeriodo({ periodoId }), 'Periodo aprobado.')} disabled={cargando !== null}>
          {cargando === 'apr' ? <Spinner /> : <CircleCheck className="size-4" />} Aprobar
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
      {/* Correcciones: reabrir para rehacer, o eliminar si el periodo se creó por error. */}
      {puedeAprobar && puedeReabrir && (
        <Button size="sm" variant="outline" onClick={() => setConfirmar('reabrir')} disabled={cargando !== null}>
          {cargando === 'rea' ? <Spinner /> : <LockOpen className="size-4" />} Reabrir
        </Button>
      )}
      {puedeAprobar && editable && (
        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmar('eliminar')} disabled={cargando !== null}>
          {cargando === 'eli' ? <Spinner /> : <Trash2 className="size-4" />} Eliminar periodo
        </Button>
      )}
      {estado === 'CERRADA' && <span className="text-xs text-muted-foreground ml-auto">Periodo cerrado. Reábrelo para corregirlo, o usa un periodo de ajuste.</span>}
      {estado === 'PAGADA' && <span className="text-xs text-muted-foreground ml-auto">Periodo pagado (inmutable). Usa un periodo de ajuste para corregir.</span>}

      <AlertDialog open={confirmar !== null} onOpenChange={(o) => { if (!o && cargando === null) setConfirmar(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmar === 'reabrir' ? '¿Reabrir este periodo?' : '¿Eliminar este periodo?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmar === 'reabrir'
                ? 'Vuelve a BORRADOR y se deshace lo que había aplicado: los abonos a préstamos regresan al saldo, las bonificaciones vuelven a quedar pendientes y se liberan las vacaciones pagadas por anticipado. Tendrás que liquidar de nuevo.'
                : 'Se borra el periodo y sus liquidaciones. Los abonos a préstamos y las bonificaciones se revierten; las comisiones y horas registradas NO se borran (quedan libres para asignarlas a otro periodo). Las novedades de concepto sí se pierden.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" disabled={cargando !== null} onClick={() => setConfirmar(null)}>Cancelar</Button>
            <Button
              variant={confirmar === 'eliminar' ? 'destructive' : 'default'}
              disabled={cargando !== null}
              onClick={async () => {
                if (confirmar === 'reabrir') {
                  await ejecutar('rea', () => reabrirPeriodo({ periodoId }), 'Periodo reabierto. Vuelve a liquidarlo.')
                  setConfirmar(null)
                } else {
                  setCargando('eli')
                  const res = await eliminarPeriodo({ periodoId })
                  setCargando(null)
                  setConfirmar(null)
                  if (res.ok) { toast.success('Periodo eliminado.'); router.push('/nomina'); router.refresh() }
                  else toast.error(res.error)
                }
              }}
            >
              {cargando !== null ? <Spinner /> : null}
              {confirmar === 'reabrir' ? 'Reabrir periodo' : 'Eliminar periodo'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CardContent></Card>
  )
}
