import { getHolidaysForYear } from 'colombian-holidays'
import { formatFechaISO, parseFechaISO } from '@/lib/fechas'

/**
 * Días hábiles de Colombia (Ley 51 de 1983 / algoritmo Emiliani).
 *
 * Los "días hábiles" excluyen domingos y festivos nacionales. El sábado cuenta
 * como hábil por defecto (configurable en ConfiguracionEmpresa.sabadoHabil).
 *
 * Fuente de festivos: librería `colombian-holidays` (usa `celebrationDate`, ya
 * con el traslado Emiliani al lunes). Se puede sobrescribir con FestivoExcepcion
 * (ADD/REMOVE) para días decretados fuera de calendario.
 */

export type ExcepcionFestivo = { fecha: string; tipo: 'ADD' | 'REMOVE' }

/** Conjunto de festivos (ISO yyyy-mm-dd) para un rango de años, con excepciones. */
export function festivosDeRango(
  anioDesde: number,
  anioHasta: number,
  excepciones: ExcepcionFestivo[] = [],
): Set<string> {
  const set = new Set<string>()
  for (let anio = anioDesde; anio <= anioHasta; anio++) {
    for (const h of getHolidaysForYear(anio)) {
      set.add(h.celebrationDate) // fecha observada (trasladada)
    }
  }
  for (const e of excepciones) {
    if (e.tipo === 'ADD') set.add(e.fecha)
    else set.delete(e.fecha)
  }
  return set
}

function esDomingo(d: Date): boolean {
  return d.getUTCDay() === 0
}
function esSabado(d: Date): boolean {
  return d.getUTCDay() === 6
}

export function esDiaHabil(
  fecha: Date,
  festivos: Set<string>,
  sabadoHabil = true,
): boolean {
  if (esDomingo(fecha)) return false
  if (!sabadoHabil && esSabado(fecha)) return false
  if (festivos.has(formatFechaISO(fecha))) return false
  return true
}

function sumarDias(fecha: Date, n: number): Date {
  const d = new Date(fecha)
  d.setUTCDate(d.getUTCDate() + n)
  return d
}

/** Suma N días hábiles a una fecha (N≥0). */
export function sumarDiasHabiles(
  fecha: Date,
  n: number,
  festivos: Set<string>,
  sabadoHabil = true,
): Date {
  let d = new Date(fecha)
  let restantes = n
  while (restantes > 0) {
    d = sumarDias(d, 1)
    if (esDiaHabil(d, festivos, sabadoHabil)) restantes--
  }
  return d
}

/** Resta N días hábiles a una fecha (para calcular "X días hábiles antes del vencimiento"). */
export function restarDiasHabiles(
  fecha: Date,
  n: number,
  festivos: Set<string>,
  sabadoHabil = true,
): Date {
  let d = new Date(fecha)
  let restantes = n
  while (restantes > 0) {
    d = sumarDias(d, -1)
    if (esDiaHabil(d, festivos, sabadoHabil)) restantes--
  }
  return d
}

/** Cuenta días hábiles entre dos fechas (sin incluir `desde`, incluyendo `hasta`). */
export function diasHabilesEntre(
  desde: Date,
  hasta: Date,
  festivos: Set<string>,
  sabadoHabil = true,
): number {
  if (hasta <= desde) return 0
  let conteo = 0
  let d = new Date(desde)
  while (d < hasta) {
    d = sumarDias(d, 1)
    if (esDiaHabil(d, festivos, sabadoHabil)) conteo++
  }
  return conteo
}

/**
 * Fecha de alerta = N días (hábiles o calendario) antes del vencimiento.
 * Helper de conveniencia que acepta strings ISO y devuelve string ISO.
 */
export function fechaAlerta(
  fechaVencimientoISO: string,
  diasAntes: number,
  enDiasHabiles: boolean,
  festivos: Set<string>,
  sabadoHabil = true,
): string {
  const venc = parseFechaISO(fechaVencimientoISO)!
  const fecha = enDiasHabiles
    ? restarDiasHabiles(venc, diasAntes, festivos, sabadoHabil)
    : sumarDias(venc, -diasAntes)
  return formatFechaISO(fecha)
}
