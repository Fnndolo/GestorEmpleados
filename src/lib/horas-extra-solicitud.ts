/**
 * Reglas de la solicitud de horas extra (módulo "Autorización de horas extra").
 * Puras, sin base de datos: las usan el formulario y el servidor por igual.
 */

/** Límites legales (CST art. 22 Ley 50 de 1990): 2 horas extra al día y 12 a la semana. */
export const LIMITE_HORAS_EXTRA_DIA = 2
export const LIMITE_HORAS_EXTRA_SEMANA = 12
/**
 * ¿El soporte es obligatorio? Por ahora no (decisión de empresa, 2026-09-25):
 * se puede adjuntar, pero se envía y se aprueba sin él. Poner en `true` para
 * exigirlo otra vez al pedir y al aprobar.
 */
export const SOPORTE_HORAS_EXTRA_OBLIGATORIO = false

/** Hasta cuántos días hábiles después de hacerlas se pueden pedir (decisión de empresa). */
export const DIAS_HABILES_POSTERIOR = 3

/** Horas (con decimales, a la décima) entre "HH:MM" y "HH:MM" del mismo día. */
export function horasEntreHoras(ini: string, fin: string): number {
  const [hi, mi] = ini.split(':').map(Number)
  const [hf, mf] = fin.split(':').map(Number)
  return Math.max(0, Math.round(((hf * 60 + mf - (hi * 60 + mi)) / 60) * 10) / 10)
}

/** Lunes y domingo (ISO) de la semana de la fecha: la semana del límite de 12 horas. */
export function semanaDe(fechaISO: string): { desde: string; hasta: string } {
  const d = new Date(`${fechaISO}T00:00:00Z`)
  const lunes = new Date(d)
  lunes.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  const domingo = new Date(lunes)
  domingo.setUTCDate(lunes.getUTCDate() + 6)
  return { desde: lunes.toISOString().slice(0, 10), hasta: domingo.toISOString().slice(0, 10) }
}

/** Lo que el servidor calcula al pedir y guarda en la solicitud para el aprobador. */
export type CalculoHorasExtra = {
  horas: number
  /** Horas del día contando esta solicitud, las aprobadas y las que están en trámite. */
  totalDia: number
  totalSemana: number
  excedeDia: boolean
  excedeSemana: boolean
}

/** Texto de la alerta de límite para el aprobador (vacío si no excede). */
export function alertaLimiteHorasExtra(c: CalculoHorasExtra | null | undefined): string {
  if (!c) return ''
  const partes: string[] = []
  if (c.excedeDia) partes.push(`${c.totalDia} h ese día (máximo ${LIMITE_HORAS_EXTRA_DIA})`)
  if (c.excedeSemana) partes.push(`${c.totalSemana} h esa semana (máximo ${LIMITE_HORAS_EXTRA_SEMANA})`)
  return partes.length ? `Excede el límite legal: ${partes.join(' y ')}.` : ''
}
