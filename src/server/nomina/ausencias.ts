/**
 * Ausencias en el periodo de nómina. Helpers puros (sin BD) para poder probarlos.
 *
 * Reglas aplicadas:
 * - Licencias NO remuneradas, suspensiones del contrato y permisos no remunerados
 *   de día completo → descuentan días del salario.
 * - Incapacidades → descuentan días de salario, pero se pagan como auxilio de
 *   incapacidad al 66,67% del salario diario, con piso de 1 SMMLV proporcional
 *   (Ley 100 art. 227 / CST art. 227).
 * - Licencias remuneradas y vacaciones NO descuentan (el salario sigue corriendo).
 */

/** Días calendario de [desde, hasta] que caen dentro de [inicio, fin], ambos inclusive. */
export function diasSuperpuestos(desde: Date, hasta: Date | null, inicio: Date, fin: Date): number {
  const a = desde > inicio ? desde : inicio
  const b = !hasta || hasta > fin ? fin : hasta
  if (b < a) return 0
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000) + 1
}

/** Pago del auxilio de incapacidad: 66,67% del salario diario con piso SMMLV diario. */
export function pagoIncapacidad(dias: number, salarioMensual: number, smmlv: number): number {
  if (dias <= 0) return 0
  const valorDia = salarioMensual / 30
  const piso = smmlv / 30
  return Math.round(dias * Math.max((valorDia * 2) / 3, piso))
}
