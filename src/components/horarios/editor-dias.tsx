'use client'

import { useState } from 'react'
import { Copy, TriangleAlert } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  NOMBRE_DIA, ORDEN_DIAS, horasSemana, jornadaMaximaSemanal, textoHoras, validarDias,
  type DiaSemana, type DiasHorario,
} from '@/lib/horarios'

/** `propia`: el día ya tiene su hora (venía con el horario o se la pusieron a mano). */
type Fila = { activo: boolean; entrada: string; salida: string; almuerzoDesde: string; almuerzoHasta: string; propia: boolean }

const VACIA: Fila = { activo: false, entrada: '08:00', salida: '18:00', almuerzoDesde: '', almuerzoHasta: '', propia: false }

function filasDe(dias: DiasHorario | null): Record<DiaSemana, Fila> {
  return Object.fromEntries(ORDEN_DIAS.map((d) => {
    const f = dias?.[d]
    return [d, f ? { activo: true, entrada: f.entrada, salida: f.salida, almuerzoDesde: f.almuerzo_desde ?? '', almuerzoHasta: f.almuerzo_hasta ?? '', propia: true } : { ...VACIA }]
  })) as Record<DiaSemana, Fila>
}

// En el celular las dos horas de cada par se reparten el ancho; desde sm, ancho fijo.
const HORA = 'h-8 flex-1 sm:w-32 sm:flex-none'

const mismaHora = (a: Fila, b: Fila) => a.entrada === b.entrada && a.salida === b.salida && a.almuerzoDesde === b.almuerzoDesde && a.almuerzoHasta === b.almuerzoHasta

/** Lo que se manda al servidor (que lo valida igual): solo los días marcados. */
function diasDe(filas: Record<DiaSemana, Fila>): Record<string, unknown> {
  return Object.fromEntries(ORDEN_DIAS.filter((d) => filas[d].activo).map((d) => {
    const f = filas[d]
    return [d, { entrada: f.entrada, salida: f.salida, almuerzo_min: 0, ...(f.almuerzoDesde || f.almuerzoHasta ? { almuerzo_desde: f.almuerzoDesde, almuerzo_hasta: f.almuerzoHasta } : {}) }]
  }))
}

/**
 * Los días de un horario, uno por fila: si trabaja, entrada, salida y el
 * almuerzo (opcional). El día que se marca toma la hora del anterior, para no
 * escribirla en cada uno. Debajo, el total de la semana y si pasa de la jornada
 * máxima legal. Avisa el primer error con las mismas reglas del servidor.
 */
export function EditorDias({ inicial, onChange, deshabilitado = false }: {
  inicial: DiasHorario | null
  /** Recibe el mapa de días (sin validar) y el error, si lo hay. */
  onChange: (dias: Record<string, unknown>, error: string | null) => void
  deshabilitado?: boolean
}) {
  const [filas, setFilas] = useState(() => filasDe(inicial))

  function cambiar(nuevas: Record<DiaSemana, Fila>) {
    setFilas(nuevas)
    const dias = diasDe(nuevas)
    const v = validarDias(dias)
    onChange(dias, 'error' in v ? v.error : null)
  }
  const poner = (d: DiaSemana, cambio: Partial<Fila>) => cambiar({ ...filas, [d]: { ...filas[d], ...cambio } })
  const ponerHora = (d: DiaSemana, cambio: Partial<Fila>) => poner(d, { ...cambio, propia: true })

  // El día que se marca toma la hora del día marcado anterior (o del siguiente, si
  // no hay antes): casi siempre se repite. Si ya tenía la suya, la conserva.
  function marcar(d: DiaSemana, activo: boolean) {
    if (!activo || filas[d].propia) return poner(d, { activo })
    const i = ORDEN_DIAS.indexOf(d)
    const vecino = [...ORDEN_DIAS.slice(0, i).reverse(), ...ORDEN_DIAS.slice(i + 1)].find((o) => filas[o].activo)
    poner(d, vecino ? { ...filas[vecino], propia: false } : { activo: true })
  }

  // Si marcaron los días antes de poner la hora: la del primero a los demás.
  const marcados = ORDEN_DIAS.filter((d) => filas[d].activo)
  const modelo = marcados[0]
  const distintos = !!modelo && marcados.some((d) => !mismaHora(filas[d], filas[modelo]))
  function copiarModelo() {
    if (!modelo) return
    const base = filas[modelo]
    cambiar(Object.fromEntries(ORDEN_DIAS.map((d) => [d, filas[d].activo ? { ...base } : filas[d]])) as Record<DiaSemana, Fila>)
  }

  const v = validarDias(diasDe(filas))
  const horas = 'dias' in v ? horasSemana(v.dias) : null
  const maxima = jornadaMaximaSemanal(new Date())

  return (
    <div className="space-y-2">
      <ul className="divide-y rounded-lg border">
        {ORDEN_DIAS.map((d) => {
          const f = filas[d]
          return (
            <li key={d} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2">
              <label className="flex w-28 shrink-0 cursor-pointer items-center gap-2 text-sm font-medium">
                <Checkbox checked={f.activo} disabled={deshabilitado} onCheckedChange={(c) => marcar(d, c === true)} />
                {NOMBRE_DIA[d]}
              </label>
              {f.activo ? (
                <div className="flex min-w-0 flex-[1_1_17rem] flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="flex w-full items-center gap-1 sm:w-auto">
                    <Input type="time" aria-label={`Entrada del ${NOMBRE_DIA[d].toLowerCase()}`} className={HORA} value={f.entrada} disabled={deshabilitado} onChange={(e) => ponerHora(d, { entrada: e.target.value })} />
                    <span className="text-muted-foreground">–</span>
                    <Input type="time" aria-label={`Salida del ${NOMBRE_DIA[d].toLowerCase()}`} className={HORA} value={f.salida} disabled={deshabilitado} onChange={(e) => ponerHora(d, { salida: e.target.value })} />
                  </span>
                  <span className="flex w-full flex-wrap items-center gap-1 text-xs text-muted-foreground sm:w-auto">
                    <span className="w-full sm:w-auto">Almuerzo</span>
                    <span className="flex w-full items-center gap-1 sm:w-auto">
                      <Input type="time" aria-label={`Inicio del almuerzo del ${NOMBRE_DIA[d].toLowerCase()}`} className={HORA} value={f.almuerzoDesde} disabled={deshabilitado} onChange={(e) => ponerHora(d, { almuerzoDesde: e.target.value })} />
                      –
                      <Input type="time" aria-label={`Fin del almuerzo del ${NOMBRE_DIA[d].toLowerCase()}`} className={HORA} value={f.almuerzoHasta} disabled={deshabilitado} onChange={(e) => ponerHora(d, { almuerzoHasta: e.target.value })} />
                    </span>
                  </span>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Descanso</span>
              )}
            </li>
          )
        })}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className={cn('font-medium', horas != null && horas > maxima && 'text-amber-700 dark:text-amber-400')}>
          {horas != null ? `${textoHoras(horas)} a la semana` : '—'}
        </span>
        {!deshabilitado && modelo && distintos && (
          <Button type="button" size="sm" variant="outline" onClick={copiarModelo}>
            <Copy className="size-4" /> Copiar el {NOMBRE_DIA[modelo].toLowerCase()} a los demás días
          </Button>
        )}
      </div>
      {'error' in v ? (
        <p className="text-xs text-destructive">{v.error}</p>
      ) : horas != null && horas > maxima ? (
        <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          Pasa de la jornada máxima legal: {maxima} h a la semana (Ley 2101 de 2021). Lo que exceda son horas extra.
        </p>
      ) : null}
    </div>
  )
}
