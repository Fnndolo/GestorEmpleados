/**
 * Ausencias en el periodo de nómina. Helpers puros (sin BD) para poder probarlos.
 *
 * Reglas aplicadas:
 * - Licencias NO remuneradas, suspensiones del contrato y permisos no remunerados
 *   de día completo → descuentan días del salario.
 * - Incapacidades → descuentan días de salario y se pagan como auxilio, con un
 *   porcentaje que depende del origen y de la duración (ver pagoIncapacidad).
 * - Licencias remuneradas y vacaciones NO descuentan (el salario sigue corriendo).
 */

/** Días calendario de [desde, hasta] que caen dentro de [inicio, fin], ambos inclusive. */
export function diasSuperpuestos(desde: Date, hasta: Date | null, inicio: Date, fin: Date): number {
  const a = desde > inicio ? desde : inicio
  const b = !hasta || hasta > fin ? fin : hasta
  if (b < a) return 0
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000) + 1
}

/** Tipos que NO son enfermedad general: se pagan completos. */
const AL_CIEN_POR_CIENTO = new Set([
  // Origen laboral: la ARL paga el 100% del IBC desde el día siguiente al
  // accidente (Ley 776 de 2002, art. 3). Pagarlo al 66,67% es quitarle a la
  // persona un tercio de su salario por accidentarse trabajando.
  'ACCIDENTE_TRABAJO',
  'ENFERMEDAD_LABORAL',
  // Licencias de maternidad y paternidad: 100% del salario (Ley 1822 de 2017).
  'LICENCIA_MATERNIDAD',
  'LICENCIA_PATERNIDAD',
])

/** Día del episodio a partir del cual la enfermedad general baja al 50%. */
const DIA_CAMBIO_A_MITAD = 90

/**
 * Auxilio de incapacidad de un tramo, según su origen y en qué día del episodio
 * va.
 *
 * No todas se pagan igual, y antes sí: todo salía al 66,67%.
 *  - Enfermedad general: 66,67% del salario diario los primeros 90 días y 50%
 *    del 91 al 180 (CST art. 227 / Decreto 780 de 2016), con piso de un SMMLV
 *    diario, que es el mínimo que puede recibir alguien incapacitado.
 *  - Accidente o enfermedad laboral, y licencias de maternidad/paternidad: 100%.
 *
 * @param diaInicial posición del primer día que se paga dentro del episodio
 *   completo (1 = primer día de la incapacidad). Importa porque un episodio
 *   largo cruza varios periodos de nómina y el 50% empieza en el día 91,
 *   contado desde su inicio, no desde el comienzo del mes.
 */
export function pagoIncapacidad(
  dias: number,
  salarioMensual: number,
  smmlv: number,
  tipo = 'ENFERMEDAD_GENERAL',
  diaInicial = 1,
): number {
  if (dias <= 0) return 0
  const valorDia = salarioMensual / 30
  const piso = smmlv / 30

  if (AL_CIEN_POR_CIENTO.has(tipo)) return Math.round(dias * valorDia)

  // Se recorre día por día porque el tramo puede cruzar el día 90 por la mitad.
  let total = 0
  for (let i = 0; i < dias; i++) {
    const dia = diaInicial + i
    const porcentaje = dia <= DIA_CAMBIO_A_MITAD ? 2 / 3 : 1 / 2
    total += Math.max(valorDia * porcentaje, piso)
  }
  return Math.round(total)
}

/**
 * Posición de una fecha dentro del periodo, en la convención de 30 días con que
 * se liquida la nómina en Colombia: el día 31 no se paga aparte y febrero vale
 * 30 igual que los demás meses.
 *
 * Sirve para prorratear a quien entra o sale a mitad de periodo. Quien ingresa
 * el 15 queda en la posición 15 —le corresponden 16 días— y quien se retira el
 * 10 queda en la 10, sin importar si el mes trae 28 o 31 días en el calendario.
 */
export function ordinalEnPeriodo(
  fecha: Date,
  periodo: { fechaInicio: Date; fechaFin: Date; diasPeriodo: number },
): number {
  if (fecha <= periodo.fechaInicio) return 1
  if (fecha >= periodo.fechaFin) return periodo.diasPeriodo
  const corridos = Math.floor((fecha.getTime() - periodo.fechaInicio.getTime()) / 86_400_000) + 1
  return Math.min(corridos, periodo.diasPeriodo)
}

/**
 * Días del periodo en que la persona NO tuvo vínculo vigente: los anteriores a
 * su ingreso y los posteriores a su retiro. Se descuentan como una ausencia más.
 *
 * Sin esto, quien entra el 15 cobra el mes entero y quien se retira el 10 no
 * cobra nada, porque el contrato ya no figura activo cuando corre la nómina.
 */
export function diasFueraDelVinculo(
  inicioVinculo: Date,
  finVinculo: Date | null,
  periodo: { fechaInicio: Date; fechaFin: Date; diasPeriodo: number },
): number {
  // Vínculo que no se cruza con el periodo: no le corresponde ningún día. Se
  // resuelve aparte porque ordinalEnPeriodo recorta al borde y dejaría un día
  // suelto a quien se retiró antes de que el periodo empezara.
  if (inicioVinculo > periodo.fechaFin) return periodo.diasPeriodo
  if (finVinculo && finVinculo < periodo.fechaInicio) return periodo.diasPeriodo

  const antes = ordinalEnPeriodo(inicioVinculo, periodo) - 1
  const despues = finVinculo ? periodo.diasPeriodo - ordinalEnPeriodo(finVinculo, periodo) : 0
  return Math.max(0, antes) + Math.max(0, despues)
}
