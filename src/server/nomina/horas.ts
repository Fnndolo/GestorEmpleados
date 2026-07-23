/**
 * Helpers puros de jornada y clasificación horaria.
 *
 * - Jornada máxima legal (Ley 2101 de 2021, RIT art. 18): reducción progresiva
 *   47h → 46h → 44h → 42h. El divisor de la hora ordinaria se deriva de la
 *   jornada vigente: horasMes = jornadaSemanal × 30 ÷ 6 (semana de 6 días).
 * - Jornada nocturna (Ley 2466 de 2025, RIT arts. 19.4 y 22): de 7:00 p.m.
 *   a 6:00 a.m. del día siguiente.
 */

const MIN_NOCTURNO_INICIO = 19 * 60 // 7:00 p.m.
const MIN_NOCTURNO_FIN = 6 * 60 // 6:00 a.m.

/** Horas laborables del mes según la jornada vigente a la fecha (Ley 2101 / RIT art. 18). */
export function horasMesJornada(fecha: Date): number {
  const iso = fecha.toISOString().slice(0, 10)
  if (iso >= '2026-07-15') return 210 // 42 h/sem
  if (iso >= '2025-07-15') return 220 // 44 h/sem
  if (iso >= '2024-07-15') return 230 // 46 h/sem
  if (iso >= '2023-07-15') return 235 // 47 h/sem
  return 240 // 48 h/sem (régimen anterior)
}

function aMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}

/**
 * Divide un rango horario en horas diurnas (6:00–19:00) y nocturnas (19:00–6:00),
 * soportando rangos que cruzan la medianoche (p. ej. 22:00–02:00).
 * Devuelve horas decimales redondeadas a 2 cifras.
 */
export function dividirDiurnoNocturno(horaInicio: string, horaFin: string): { diurnas: number; nocturnas: number } {
  const ini = aMinutos(horaInicio)
  let fin = aMinutos(horaFin)
  if (fin <= ini) fin += 24 * 60 // cruza medianoche

  let nocturnas = 0
  // Ventanas nocturnas sobre una línea de tiempo de hasta 2 días:
  // [19:00, 24:00) y [00:00, 06:00) de cada día.
  for (const k of [0, 1]) {
    const ventanas: [number, number][] = [
      [k * 1440 + MIN_NOCTURNO_INICIO, k * 1440 + 1440],
      [k * 1440, k * 1440 + MIN_NOCTURNO_FIN],
    ]
    for (const [a, b] of ventanas) {
      nocturnas += Math.max(0, Math.min(fin, b) - Math.max(ini, a))
    }
  }
  const total = fin - ini
  const r = (n: number) => Math.round((n / 60) * 100) / 100
  return { diurnas: r(total - nocturnas), nocturnas: r(nocturnas) }
}

/**
 * Pareja diurna/nocturna de cada código de hora, para clasificar automáticamente
 * un rango que cruza las 7:00 p.m. (Ley 2466). `null` = esa franja no genera pago
 * (la hora ordinaria diurna no tiene recargo).
 */
export const PAREJA_TIPO_HORA: Record<string, { diurno: string | null; nocturno: string }> = {
  HED: { diurno: 'HED', nocturno: 'HEN' },
  HEN: { diurno: 'HED', nocturno: 'HEN' },
  RN: { diurno: null, nocturno: 'RN' },
  RD: { diurno: 'RD', nocturno: 'RND' },
  RND: { diurno: 'RD', nocturno: 'RND' },
  HEDD: { diurno: 'HEDD', nocturno: 'HEND' },
  HEND: { diurno: 'HEDD', nocturno: 'HEND' },
}
