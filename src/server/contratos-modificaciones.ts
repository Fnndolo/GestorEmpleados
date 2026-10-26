/**
 * Reglas puras de las correcciones y anulaciones de las modificaciones de un
 * contrato (prórrogas, suspensiones, variaciones salariales). Sin acceso a la
 * base: lo que aquí se decide se prueba solo, y las acciones solo lo aplican.
 */

/**
 * Hasta dónde mira el bloqueo de nómina cuando una corrección afecta "todo lo
 * que venga después" (una prórroga, un cambio de salario): cualquier nómina
 * cerrada posterior al inicio ya contó con el dato que se quiere cambiar.
 */
export const FECHA_LEJANA = new Date(Date.UTC(9999, 0, 1))

/** La menor de dos fechas de negocio. */
export function menorFecha(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b
}

/** La mayor de dos fechas de negocio; `null` cuenta como "sin fin" (gana). */
export function mayorFechaOAbierta(a: Date | null, b: Date | null): Date | null {
  if (!a || !b) return null
  return a.getTime() >= b.getTime() ? a : b
}

/**
 * A qué fecha de fin vuelve el contrato cuando se anula su prórroga más reciente.
 *
 * El contrato no guarda la fecha de fin que tenía antes de cada prórroga (al
 * prorrogar se sobrescribe), así que se reconstruye: si hay una prórroga
 * anterior, el contrato terminaba donde terminaba ella; si la anulada es la
 * primera, terminaba el día anterior al inicio de la prórroga, que es cuando
 * una prórroga empieza (el día siguiente al vencimiento del periodo anterior).
 */
export function fechaFinTrasAnularProrroga(
  anulada: { fechaInicio: Date },
  previa: { fechaFin: Date } | null,
): Date {
  if (previa) return previa.fechaFin
  const d = new Date(anulada.fechaInicio)
  d.setUTCDate(d.getUTCDate() - 1)
  return d
}

/**
 * Si el contrato debe seguir en SUSPENDIDO: hay al menos una suspensión sin
 * fecha de fin o cuyo fin aún no pasó (igual criterio que al registrarla: una
 * suspensión programada ya deja el contrato suspendido).
 */
export function sigueSuspendido(suspensiones: { fechaFin: Date | null }[], hoy: Date): boolean {
  return suspensiones.some((s) => s.fechaFin === null || s.fechaFin.getTime() >= hoy.getTime())
}

/**
 * Qué variación salarial es la vigente: la de fecha de vigencia más reciente y,
 * a igual fecha, la registrada más tarde. Es la única que fija el salario del
 * contrato al corregirla o borrarla.
 */
export function esVariacionMasReciente<T extends { id: string; fechaVigencia: Date; creadoEn: Date }>(
  id: string,
  variaciones: T[],
): boolean {
  if (variaciones.length === 0) return false
  const top = [...variaciones].sort((a, b) =>
    b.fechaVigencia.getTime() - a.fechaVigencia.getTime() || b.creadoEn.getTime() - a.creadoEn.getTime(),
  )[0]
  return top.id === id
}

/** El número de otrosí del que nació una variación salarial, si vino de uno. */
export function numeroOtrosiDeMotivo(motivo: string | null | undefined): number | null {
  const m = motivo?.match(/^Otrosí (\d+)$/)
  return m ? parseInt(m[1], 10) : null
}
