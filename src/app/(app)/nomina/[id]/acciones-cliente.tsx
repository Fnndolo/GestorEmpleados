'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Calculator, CircleCheck, Lock, LockOpen, Trash2, FileText, FileSpreadsheet, RefreshCw, Ellipsis } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { liquidar, aprobarPeriodo, cerrarPeriodo, reabrirPeriodo, eliminarPeriodo, generarPdfDesprendibles } from '../acciones'

type Resultado = { ok: boolean; error?: string; datos?: unknown }

/**
 * Avisos que deja una liquidación o un cierre, aparte del "listo": horas del
 * sistema de asistencia que no se pudieron actualizar, o el pago que no se pudo
 * anotar en AsistencIA. Los comparte el alta del periodo, que liquida de una vez.
 */
export function avisosDeNomina(datos: unknown) {
  // La nómina se liquidó, pero con horas de asistencia que no se pudieron
  // actualizar: se dice, porque si alguien corrigió una marcación en el otro
  // sistema, esas correcciones no entraron en este cálculo.
  const sinRefrescar = (datos as { horasSinRefrescar?: number } | undefined)?.horasSinRefrescar ?? 0
  if (sinRefrescar > 0) {
    toast.warning(
      `Se liquidó con ${sinRefrescar} registro(s) de horas del sistema de asistencia sin actualizar: no está configurado. Si hubo cambios en las marcaciones, no entraron en este cálculo.`,
      { duration: 10000 },
    )
  }
  // Al cerrar o reabrir, AsistencIA queda enterada de lo pagado; si no
  // respondió, se dice: allá seguirán saliendo como pendientes hasta que
  // se vuelva a anotar.
  const asistencia = (datos as { asistencia?: { anotados: number; omitido?: boolean; error?: string } } | undefined)?.asistencia
  if (asistencia?.error) {
    toast.warning(`El periodo quedó listo, pero no se pudo anotar el pago en AsistencIA: ${asistencia.error}`, { duration: 10000 })
  } else if (asistencia && asistencia.anotados > 0) {
    toast.message(`${asistencia.anotados} tramo(s) de horas extra anotados en AsistencIA.`)
  }
}

/**
 * Las acciones del periodo, arriba en el encabezado. El periodo nace ya
 * liquidado, así que no hay un paso previo de "borrador": lo que sigue según el
 * estado va como botón (aprobar, cerrar), recalcular al lado mientras se pueda
 * corregir, y lo ocasional (desprendibles, PILA, reabrir, eliminar) en el menú.
 */
export function AccionesPeriodo({
  periodoId, estado, tieneLiquidaciones, puedeOperar, puedeAprobar, puedeExportar,
}: {
  periodoId: string; estado: string; tieneLiquidaciones: boolean
  puedeOperar: boolean; puedeAprobar: boolean; puedeExportar: boolean
}) {
  const router = useRouter()
  const [cargando, setCargando] = useState<string | null>(null)
  const [confirmar, setConfirmar] = useState<'reabrir' | 'eliminar' | null>(null)

  async function ejecutar(clave: string, fn: () => Promise<Resultado>, exito: string): Promise<boolean> {
    setCargando(clave)
    const res = await fn()
    setCargando(null)
    if (!res.ok) { toast.error(res.error); return false }
    toast.success(exito)
    avisosDeNomina(res.datos)
    router.refresh()
    return true
  }

  const editable = estado === 'BORRADOR' || estado === 'CALCULADA'
  // Reabrir: cualquier estado ya avanzado, salvo PAGADA (esa se corrige con un ajuste).
  const puedeReabrir = puedeAprobar && (estado === 'APROBADA' || estado === 'CERRADA')
  const exportar = puedeExportar && tieneLiquidaciones
  const eliminar = puedeAprobar && editable
  const ocupado = cargando !== null
  const hayMenu = exportar || puedeReabrir || eliminar

  return (
    <div className="flex items-center gap-2">
      {puedeOperar && editable && (
        tieneLiquidaciones ? (
          <Button size="sm" variant="outline" onClick={() => ejecutar('liq', () => liquidar({ periodoId }), 'Nómina recalculada con los datos actuales.')} disabled={ocupado} aria-label="Recalcular" title="Recalcular con los datos actuales">
            {cargando === 'liq' ? <Spinner /> : <RefreshCw className="size-4" />} <span className="hidden sm:inline">Recalcular</span>
          </Button>
        ) : (
          <Button size="sm" onClick={() => ejecutar('liq', () => liquidar({ periodoId }), 'Nómina calculada.')} disabled={ocupado}>
            {cargando === 'liq' ? <Spinner /> : <Calculator className="size-4" />} Calcular
          </Button>
        )
      )}
      {puedeAprobar && estado === 'CALCULADA' && (
        <Button size="sm" onClick={() => ejecutar('apr', () => aprobarPeriodo({ periodoId }), 'Periodo aprobado.')} disabled={ocupado}>
          {cargando === 'apr' ? <Spinner /> : <CircleCheck className="size-4" />} Aprobar
        </Button>
      )}
      {puedeAprobar && estado === 'APROBADA' && (
        <Button size="sm" onClick={() => ejecutar('cer', () => cerrarPeriodo({ periodoId }), 'Periodo cerrado.')} disabled={ocupado}>
          {cargando === 'cer' ? <Spinner /> : <Lock className="size-4" />} Cerrar
        </Button>
      )}

      {hayMenu && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" aria-label="Más acciones" disabled={ocupado}>
              {cargando === 'pdf' || cargando === 'rea' ? <Spinner /> : <Ellipsis className="size-4" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            {exportar && (
              <>
                <DropdownMenuItem onSelect={() => ejecutar('pdf', () => generarPdfDesprendibles({ periodoId }), 'Desprendibles generados.')}>
                  <FileText className="size-4" /> Generar desprendibles PDF
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={`/api/nomina/${periodoId}/pila`}><FileSpreadsheet className="size-4" /> Resumen PILA</a>
                </DropdownMenuItem>
              </>
            )}
            {puedeReabrir && (
              <DropdownMenuItem onSelect={() => setConfirmar('reabrir')}>
                <LockOpen className="size-4" /> Reabrir para corregir
              </DropdownMenuItem>
            )}
            {eliminar && (
              <>
                {(exportar || puedeReabrir) && <DropdownMenuSeparator />}
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirmar('eliminar')}>
                  <Trash2 className="size-4" /> Eliminar periodo
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <AlertDialog open={confirmar !== null} onOpenChange={(o) => { if (!o && !ocupado) setConfirmar(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmar === 'reabrir' ? '¿Reabrir este periodo?' : '¿Eliminar este periodo?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmar === 'reabrir'
                ? 'Se deshace lo que había aplicado —los abonos a préstamos regresan al saldo, las bonificaciones vuelven a quedar pendientes y se liberan las vacaciones pagadas por anticipado— y el periodo se recalcula con los datos actuales, listo para revisarlo y aprobarlo de nuevo.'
                : 'Se borra el periodo y sus liquidaciones. Los abonos a préstamos y las bonificaciones se revierten; las comisiones y horas registradas NO se borran (quedan libres para asignarlas a otro periodo). Las novedades de concepto sí se pierden.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="ghost" disabled={ocupado} onClick={() => setConfirmar(null)}>Cancelar</Button>
            <Button
              variant={confirmar === 'eliminar' ? 'destructive' : 'default'}
              disabled={ocupado}
              onClick={async () => {
                if (confirmar === 'reabrir') {
                  // Reabrir y recalcular de una: el periodo no pasa por un
                  // borrador vacío, queda calculado con los datos de hoy.
                  const ok = await ejecutar('rea', () => reabrirPeriodo({ periodoId }), 'Periodo reabierto.')
                  setConfirmar(null)
                  if (ok && puedeOperar) await ejecutar('liq', () => liquidar({ periodoId }), 'Nómina recalculada con los datos actuales.')
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
              {ocupado ? <Spinner /> : null}
              {confirmar === 'reabrir' ? 'Reabrir y recalcular' : 'Eliminar periodo'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
