/**
 * Horarios de trabajo: reglas puras (sin base ni React) que comparten las
 * pantallas, el PDF de la comunicación y la sincronización con AsistencIA.
 *
 * El formato es EXACTAMENTE el de AsistencIA, para que traer y llevar horarios
 * no traduzca nada:
 *
 *   { "0".."6": { entrada: "HH:MM", salida: "HH:MM", almuerzo_min,
 *                 almuerzo_desde?: "HH:MM", almuerzo_hasta?: "HH:MM" } }
 *
 * 0 = domingo … 6 = sábado (como Date.getUTCDay). Un día ausente es descanso.
 * `validarDias` aplica las mismas reglas que allá: lo que pasa aquí, allá entra.
 */

export type DiaSemana = '0' | '1' | '2' | '3' | '4' | '5' | '6'

export type FranjaDia = {
  entrada: string
  salida: string
  /** Minutos de almuerzo (sale del rango cuando lo hay). */
  almuerzo_min: number
  almuerzo_desde?: string
  almuerzo_hasta?: string
}

export type DiasHorario = Partial<Record<DiaSemana, FranjaDia>>

/** Orden de la semana en pantalla y documentos: lunes primero. */
export const ORDEN_DIAS: DiaSemana[] = ['1', '2', '3', '4', '5', '6', '0']

export const NOMBRE_DIA: Record<DiaSemana, string> = {
  '1': 'Lunes', '2': 'Martes', '3': 'Miércoles', '4': 'Jueves', '5': 'Viernes', '6': 'Sábado', '0': 'Domingo',
}

export const DIA_CORTO: Record<DiaSemana, string> = {
  '1': 'Lun', '2': 'Mar', '3': 'Mié', '4': 'Jue', '5': 'Vie', '6': 'Sáb', '0': 'Dom',
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5))

/**
 * Normaliza y valida el mapa de días (mismas reglas que AsistencIA): horas
 * HH:MM reales, el almuerzo como rango completo y dentro de la jornada (hasta
 * 4 horas), y al menos un día laborable. Un turno nocturno (22:00–06:00)
 * termina al día siguiente.
 */
export function validarDias(v: unknown): { dias: DiasHorario } | { error: string } {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return { error: 'El horario no tiene días.' }
  const dias: DiasHorario = {}
  for (const [k, f] of Object.entries(v as Record<string, unknown>)) {
    if (!/^[0-6]$/.test(k)) return { error: `Día inválido: "${k}".` }
    if (f == null) continue
    const dia = NOMBRE_DIA[k as DiaSemana]
    const franja = f as Record<string, unknown>
    const entrada = String(franja.entrada ?? '')
    const salida = String(franja.salida ?? '')
    if (!HHMM.test(entrada) || !HHMM.test(salida)) return { error: `${dia}: la entrada y la salida deben ser horas válidas (HH:MM).` }
    if (entrada === salida) return { error: `${dia}: la entrada y la salida no pueden ser la misma hora.` }

    const hora = (x: unknown) => (x == null || x === '' ? null : String(x))
    const desde = hora(franja.almuerzo_desde)
    const hasta = hora(franja.almuerzo_hasta)
    if ((desde !== null && !HHMM.test(desde)) || (hasta !== null && !HHMM.test(hasta))) {
      return { error: `${dia}: el almuerzo debe ir de una hora válida a otra.` }
    }
    if ((desde === null) !== (hasta === null)) return { error: `${dia}: el almuerzo necesita la hora de inicio y la de fin.` }

    let almuerzo = Number(franja.almuerzo_min ?? 0)
    if (desde !== null && hasta !== null) {
      const ini = minutos(entrada)
      const fin = minutos(salida) <= ini ? minutos(salida) + 1440 : minutos(salida)
      const a1 = minutos(desde) < ini ? minutos(desde) + 1440 : minutos(desde)
      const a2 = minutos(hasta) <= a1 ? minutos(hasta) + 1440 : minutos(hasta)
      if (!(ini < a1 && a2 < fin)) return { error: `${dia}: el almuerzo (${desde}–${hasta}) debe quedar dentro de la jornada.` }
      almuerzo = a2 - a1
      if (almuerzo > 240) return { error: `${dia}: el almuerzo no puede pasar de 4 horas.` }
    }
    if (!Number.isInteger(almuerzo) || almuerzo < 0 || almuerzo > 240) return { error: `${dia}: el almuerzo debe ser de 0 a 240 minutos.` }
    dias[k as DiaSemana] = { entrada, salida, almuerzo_min: almuerzo, ...(desde && hasta ? { almuerzo_desde: desde, almuerzo_hasta: hasta } : {}) }
  }
  if (Object.keys(dias).length === 0) return { error: 'El horario necesita al menos un día de trabajo.' }
  return { dias }
}

/** Minutos trabajados en una franja (sin el almuerzo). */
export function minutosFranja(f: FranjaDia): number {
  const ini = minutos(f.entrada)
  const fin = minutos(f.salida) <= ini ? minutos(f.salida) + 1440 : minutos(f.salida)
  return fin - ini - (f.almuerzo_min ?? 0)
}

/** Horas de trabajo a la semana, con decimales (44,5 = 44 h 30 min). */
export function horasSemana(dias: DiasHorario): number {
  return ORDEN_DIAS.reduce((t, d) => t + (dias[d] ? minutosFranja(dias[d]) : 0), 0) / 60
}

/** "44 h" o "44 h 30 min". */
export function textoHoras(horas: number): string {
  const total = Math.round(horas * 60)
  const h = Math.floor(total / 60)
  const m = total % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

/** "08:00–18:00", con el almuerzo si lo hay. */
export function textoFranja(f: FranjaDia, conAlmuerzo = true): string {
  const base = `${f.entrada}–${f.salida}`
  if (!conAlmuerzo) return base
  if (f.almuerzo_desde && f.almuerzo_hasta) return `${base} · almuerzo ${f.almuerzo_desde}–${f.almuerzo_hasta}`
  return f.almuerzo_min ? `${base} · almuerzo ${f.almuerzo_min} min` : base
}

const claveFranja = (f: FranjaDia | undefined) =>
  f ? [f.entrada, f.salida, f.almuerzo_min ?? 0, f.almuerzo_desde ?? '', f.almuerzo_hasta ?? ''].join('|') : ''

/**
 * El horario en una línea: "Lun–Vie 08:00–18:00 · Sáb 08:00–13:00". Junta los
 * días seguidos con la misma franja; el almuerzo no va, para que quepa.
 */
export function resumenHorario(dias: DiasHorario): string {
  const partes: string[] = []
  let i = 0
  while (i < ORDEN_DIAS.length) {
    const d = ORDEN_DIAS[i]
    const f = dias[d]
    if (!f) { i++; continue }
    let j = i
    while (j + 1 < ORDEN_DIAS.length && claveFranja(dias[ORDEN_DIAS[j + 1]]) === claveFranja(f)) j++
    const rango = i === j ? DIA_CORTO[d] : `${DIA_CORTO[d]}–${DIA_CORTO[ORDEN_DIAS[j]]}`
    partes.push(`${rango} ${textoFranja(f, false)}`)
    i = j + 1
  }
  return partes.length ? partes.join(' · ') : 'Sin días de trabajo'
}

/** ¿Son el mismo horario? (Mismos días, horas y almuerzo.) */
export function mismosDias(a: DiasHorario | null | undefined, b: DiasHorario | null | undefined): boolean {
  if (!a || !b) return !a && !b
  return ORDEN_DIAS.every((d) => claveFranja(a[d]) === claveFranja(b[d]))
}

/** ¿Trabaja ese día de la semana? (0 = domingo.) */
export function trabajaDia(dias: DiasHorario, diaSemana: number): boolean {
  return !!dias[String(diaSemana) as DiaSemana]
}

/**
 * Jornada máxima semanal según la Ley 2101 de 2021, que la baja por tramos
 * cada 15 de julio: 47 h (2023), 46 h (2024), 44 h (2025) y 42 h (2026).
 */
export function jornadaMaximaSemanal(fecha: Date): number {
  const iso = fecha.toISOString().slice(0, 10)
  if (iso >= '2026-07-15') return 42
  if (iso >= '2025-07-15') return 44
  if (iso >= '2024-07-15') return 46
  if (iso >= '2023-07-15') return 47
  return 48
}
