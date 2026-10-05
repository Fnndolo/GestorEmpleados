import { getHolidaysForYear } from 'colombian-holidays'
import { formatFechaISO, parseFechaISO } from '@/lib/fechas'

/**
 * Días hábiles de Colombia (Ley 51 de 1983 / algoritmo Emiliani).
 *
 * Los "días hábiles" excluyen domingos y festivos nacionales. El sábado cuenta
 * como hábil por defecto (configurable en ConfiguracionEmpresa.sabadoHabil).
 *
 * Fuente de festivos: librería `colombian-holidays` (usa `celebrationDate`, ya
 * con el traslado Emiliani al lunes), más LEYES_NUEVAS para los festivos que el
 * Congreso creó después de esa versión. Se puede sobrescribir con
 * FestivoExcepcion (ADD/REMOVE) desde Ajustes → Festivos.
 */

export type ExcepcionFestivo = { fecha: string; tipo: 'ADD' | 'REMOVE'; nombre?: string | null }

/**
 * Festivos creados por ley después de la versión instalada de la librería. Cada
 * uno rige desde su año (no hacia atrás: la librería nueva los aplica a todos
 * los años, por eso no se actualizó y se agregan aquí).
 */
const LEYES_NUEVAS: { mes: number; dia: number; desde: number; aLunes: boolean; nombre: string; ley: string }[] = [
  // Sancionada el 4-jun-2026: 9 de julio, trasladable al lunes (en 2026 fue el 13).
  { mes: 7, dia: 9, desde: 2026, aLunes: true, nombre: 'Nuestra Señora del Rosario de Chiquinquirá', ley: 'Ley 2578 de 2026' },
]

export type Festivo = { fecha: string; nombre: string; origen: 'calendario' | 'agregado' | 'quitado'; ley?: string }

/** Lunes siguiente (o el mismo día si ya es lunes): el traslado de la Ley Emiliani. */
function aLunes(anio: number, mes: number, dia: number): string {
  const d = new Date(Date.UTC(anio, mes - 1, dia))
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7))
  return d.toISOString().slice(0, 10)
}

/** Los festivos de ley de un año, con su nombre, antes de las excepciones. */
function festivosDeLey(anio: number): Festivo[] {
  const lista: Festivo[] = getHolidaysForYear(anio).map((h) => ({ fecha: h.celebrationDate, nombre: h.name.es, origen: 'calendario' }))
  for (const l of LEYES_NUEVAS) {
    if (anio < l.desde) continue
    const fecha = l.aLunes ? aLunes(anio, l.mes, l.dia) : `${anio}-${String(l.mes).padStart(2, '0')}-${String(l.dia).padStart(2, '0')}`
    lista.push({ fecha, nombre: l.nombre, origen: 'calendario', ley: l.ley })
  }
  return lista
}

/**
 * Los festivos de un año con nombre y de dónde salen, para mostrarlos. Las
 * excepciones de ese año se aplican: las agregadas aparecen y las quitadas
 * quedan marcadas (siguen en la lista para que se vea qué se quitó).
 */
export function festivosDelAnio(anio: number, excepciones: ExcepcionFestivo[] = []): Festivo[] {
  const lista = festivosDeLey(anio)
  for (const e of excepciones) {
    if (!e.fecha.startsWith(`${anio}-`)) continue
    if (e.tipo === 'ADD') { if (!lista.some((f) => f.fecha === e.fecha)) lista.push({ fecha: e.fecha, nombre: e.nombre || 'Festivo agregado', origen: 'agregado' }) }
    else for (const f of lista) if (f.fecha === e.fecha) f.origen = 'quitado'
  }
  return lista.sort((a, b) => a.fecha.localeCompare(b.fecha))
}

/** Conjunto de festivos (ISO yyyy-mm-dd) para un rango de años, con excepciones. */
export function festivosDeRango(
  anioDesde: number,
  anioHasta: number,
  excepciones: ExcepcionFestivo[] = [],
): Set<string> {
  const set = new Set<string>()
  for (let anio = anioDesde; anio <= anioHasta; anio++) {
    for (const h of festivosDeLey(anio)) set.add(h.fecha) // fecha observada (trasladada)
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
