/**
 * Piezas cortas para los avisos de la campana.
 *
 * Un aviso tiene que leerse de un vistazo en el celular: primero quién, luego
 * qué ("Yeison Córdoba pidió permiso") y, en la segunda línea, el dato que
 * importa (la fecha, las horas, el número del contrato). Los párrafos que
 * explican qué hacer después van en el correo, no aquí.
 */

const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** "Yeison Córdoba": todos los nombres y solo el primer apellido. */
export function nombreCorto(nombres: string | null | undefined, apellidos: string | null | undefined): string {
  const n = (nombres ?? '').trim()
  const a = (apellidos ?? '').trim().split(/\s+/)[0] ?? ''
  return `${n} ${a}`.trim() || 'Un colaborador'
}

function partes(f: string | Date): { d: number; m: number; a: number } | null {
  if (f instanceof Date) return { d: f.getUTCDate(), m: f.getUTCMonth(), a: f.getUTCFullYear() }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(f)
  if (!m) return null
  return { d: Number(m[3]), m: Number(m[2]) - 1, a: Number(m[1]) }
}

/** "22 sep" (con año solo si no es el actual). Fechas puras: ISO 'yyyy-mm-dd' o Date en UTC. */
export function fechaBreve(f: string | Date | null | undefined): string {
  if (!f) return ''
  const p = partes(f)
  if (!p) return String(f)
  const hoy = new Date().getUTCFullYear()
  return `${p.d} ${MES_CORTO[p.m]}${p.a !== hoy ? ` ${p.a}` : ''}`
}

/** "5 oct", "5–9 oct" o "28 sep–2 oct". */
export function rangoBreve(ini: string | Date | null | undefined, fin: string | Date | null | undefined): string {
  if (!ini) return fechaBreve(fin)
  if (!fin) return fechaBreve(ini)
  const a = partes(ini), b = partes(fin)
  if (!a || !b) return `${fechaBreve(ini)}–${fechaBreve(fin)}`
  if (a.d === b.d && a.m === b.m && a.a === b.a) return fechaBreve(ini)
  if (a.m === b.m && a.a === b.a) return `${a.d}–${fechaBreve(fin)}`
  return `${fechaBreve(ini)}–${fechaBreve(fin)}`
}

/** "3 días hábiles", "1 día". */
export function dias(n: number, habiles = false): string {
  const uno = n === 1
  return `${n} ${uno ? 'día' : 'días'}${habiles ? (uno ? ' hábil' : ' hábiles') : ''}`
}
