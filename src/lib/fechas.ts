/**
 * Utilidades de fecha para Colombia (America/Bogota, sin DST → offset fijo -5).
 *
 * Regla del proyecto: las fechas de negocio son DATE puro (sin hora). Nunca usar
 * `new Date(string)` directamente para fechas puras; usar estos helpers (riesgo R4).
 */

const TZ = 'America/Bogota'

/** 'yyyy-mm-dd' → Date a medianoche UTC (Prisma @db.Date guarda solo la fecha). */
export function parseFechaISO(s: string | null | undefined): Date | null {
  if (!s) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
}

/** Date → 'yyyy-mm-dd' (en UTC, que es como guardamos las fechas puras). */
export function formatFechaISO(d: Date | null | undefined): string {
  if (!d) return ''
  return d.toISOString().slice(0, 10)
}

/** Fecha de hoy en Bogotá como 'yyyy-mm-dd'. */
export function hoyBogotaISO(): string {
  // en-CA da formato yyyy-mm-dd
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())
}

/** Fecha de hoy en Bogotá como Date (medianoche UTC del día local). */
export function hoyBogota(): Date {
  return parseFechaISO(hoyBogotaISO())!
}

/** Formato legible es-CO: "12 de junio de 2026". */
export function formatFechaLarga(d: Date | null | undefined): string {
  if (!d) return ''
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d)
}

/** Formato corto es-CO: "12/06/2026". */
export function formatFechaCorta(d: Date | null | undefined): string {
  if (!d) return ''
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d)
}

/** Edad en años a partir de la fecha de nacimiento. */
export function calcularEdad(fechaNacimiento: Date | null | undefined): number | null {
  if (!fechaNacimiento) return null
  const hoy = hoyBogota()
  let edad = hoy.getUTCFullYear() - fechaNacimiento.getUTCFullYear()
  const m = hoy.getUTCMonth() - fechaNacimiento.getUTCMonth()
  if (m < 0 || (m === 0 && hoy.getUTCDate() < fechaNacimiento.getUTCDate())) edad--
  return edad
}

/** Antigüedad legible ("2 años, 3 meses"). */
export function antiguedad(fechaIngreso: Date | null | undefined): string {
  if (!fechaIngreso) return ''
  const hoy = hoyBogota()
  let meses = (hoy.getUTCFullYear() - fechaIngreso.getUTCFullYear()) * 12 + (hoy.getUTCMonth() - fechaIngreso.getUTCMonth())
  if (hoy.getUTCDate() < fechaIngreso.getUTCDate()) meses--
  if (meses < 0) meses = 0
  const anios = Math.floor(meses / 12)
  const resto = meses % 12
  const partes: string[] = []
  if (anios > 0) partes.push(`${anios} año${anios > 1 ? 's' : ''}`)
  if (resto > 0) partes.push(`${resto} mes${resto > 1 ? 'es' : ''}`)
  return partes.join(', ') || 'menos de un mes'
}
