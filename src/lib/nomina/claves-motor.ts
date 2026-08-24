/**
 * Claves de parámetro legal que el motor de nómina lee por nombre.
 *
 * Existe para poder decir que NO se puede borrar una de estas: si desaparece el
 * SMMLV o el porcentaje de salud, la liquidación deja de calcular y el fallo
 * aparece lejos de aquí, en medio de una nómina. Los parámetros que la empresa
 * agregue por su cuenta sí se pueden borrar, porque nadie los consume.
 *
 * Módulo puro para poder probarlo y usarlo en la pantalla y en la acción.
 */

/** Las clases de riesgo se leen armando la clave: `ARL_${clase}`. */
const CLASES_ARL = ['I', 'II', 'III', 'IV', 'V'] as const

export const CLAVES_MOTOR: readonly string[] = [
  'SMMLV',
  'UVT',
  'AUX_TRANSPORTE',
  'AUX_TRANSPORTE_TOPE_SMMLV',
  'SALUD_EMPLEADO',
  'SALUD_EMPLEADOR',
  'PENSION_EMPLEADO',
  'PENSION_EMPLEADOR',
  'FSP',
  'CAJA',
  'SENA',
  'ICBF',
  'EXONERACION_SMMLV',
  'CESANTIAS',
  'INTERESES_CESANTIAS',
  'PRIMA',
  'VACACIONES',
  ...CLASES_ARL.map((c) => `ARL_${c}`),
]

const SET_MOTOR = new Set(CLAVES_MOTOR)

/** ¿El motor de nómina depende de esta clave? */
export function esClaveDelMotor(clave: string): boolean {
  return SET_MOTOR.has(clave.trim().toUpperCase())
}
