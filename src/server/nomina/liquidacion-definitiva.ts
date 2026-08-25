import Decimal from 'decimal.js'

Decimal.set({ rounding: Decimal.ROUND_HALF_UP })

export type EntradaLiquidacionDef = {
  salarioBase: number
  /** Valor mensual vigente del auxilio de transporte; 0 si no le corresponde. */
  auxilioTransporte: number
  /**
   * Promedio mensual del salario variable —comisiones, horas extra, bonificaciones
   * constitutivas— en dos ventanas distintas, porque la ley las mide distinto:
   * cesantías e intereses van sobre el último año (o el tiempo servido si es
   * menor) y la prima sobre el semestre en curso. Quien tuvo un buen semestre
   * final termina con una base de prima bastante mayor que la de cesantías.
   */
  promedioVariableAnual: number
  promedioVariableSemestre: number
  /**
   * Variable ya causada que ninguna nómina alcanzó a pagar —las comisiones del
   * último mes, típicamente—. Se paga en la liquidación y cotiza como salario.
   */
  otroConceptoSalarial: number
  /**
   * Días del último mes que ninguna nómina cubrió. La persona sale del ciclo
   * mensual al registrarse la terminación, así que ese pedazo de mes se paga
   * aquí; si la nómina ya lo pagó, va en 0 y no se duplica.
   */
  diasSalarioPendiente: number
  /**
   * Si el salario variable entra a la base de vacaciones. Se deja explícito
   * porque no todos los liquidadores del mercado lo incluyen y la diferencia es
   * visible: el contador debe poder alinear el sistema con su criterio.
   */
  variableEnVacaciones: boolean
  fechaIngreso: Date
  fechaRetiro: Date
  tipo: string // TipoTerminacion
  tipoContrato: 'TERMINO_FIJO' | 'TERMINO_INDEFINIDO' | 'OBRA_LABOR' | string
  fechaFinContrato: Date | null
  diasVacacionesPendientes: number
  saldoPrestamo: number
  smmlv: number
  porcentajeSalud: number
  porcentajePension: number
  porcentajeInteresesCesantias: number
}

export type ResultadoLiquidacionDef = {
  diasLiquidados: number
  diasSalario: number
  diasPrima: number
  // Devengados
  salario: number
  auxilioTransporte: number
  otroConceptoSalarial: number
  cesantias: number
  interesesCesantias: number
  prima: number
  vacaciones: number
  indemnizacion: number
  totalDevengado: number
  // Deducciones
  salud: number
  pension: number
  saldoPrestamo: number
  totalDeducciones: number
  total: number
  // Bases, para que el contador pueda auditar de dónde salió cada cifra
  baseCesantias: number
  basePrima: number
  baseVacaciones: number
  baseSeguridadSocial: number
  /** Compatibilidad con el detalle guardado antes de separar las dos ventanas. */
  salarioBaseLiquidacion: number
  deducciones: number
}

const peso = (d: Decimal) => d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()

/**
 * Días entre dos fechas por la convención comercial 30/360 que usa la liquidación
 * laboral en Colombia (meses de 30 días, año de 360). NO usar días calendario
 * reales: sobre-liquidaría cesantías/prima/vacaciones ~1,4% (365/360).
 *
 * El día 31 se recorta a 30 solo en la fecha de INICIO. En la de corte no: quien
 * entra el 15 de enero y sale el 31 de julio lleva 196 días, no 195. Es el
 * criterio de los liquidadores del mercado (Alegra entre ellos) y del que salen
 * las cifras que revisa el contador; recortarlo a ambos lados le quitaba un día
 * de prestaciones a todo el que se retira a fin de mes.
 */
export function dias360(desde: Date, hasta: Date): number {
  if (hasta <= desde) return 0
  let d1 = desde.getUTCDate()
  const d2 = hasta.getUTCDate()
  if (d1 === 31) d1 = 30
  const meses = (hasta.getUTCFullYear() - desde.getUTCFullYear()) * 12 + (hasta.getUTCMonth() - desde.getUTCMonth())
  return Math.max(0, meses * 30 + (d2 - d1))
}

/**
 * Liquidación definitiva: lo que se le paga a alguien el día que sale.
 *
 * Son dos cosas en un mismo documento. Primero el pedazo de mes que ninguna
 * nómina alcanzó a pagar —salario, auxilio y la variable ya causada—, que es
 * salario corriente y por eso cotiza a salud y pensión. Y después las
 * prestaciones que se venían provisionando —cesantías, intereses, prima,
 * vacaciones— más la indemnización si la terminación la genera; sobre esas no
 * se descuenta seguridad social porque no son salario.
 */
export function liquidacionDefinitiva(e: EntradaLiquidacionDef): ResultadoLiquidacionDef {
  const salarioBase = new Decimal(e.salarioBase)
  const auxilioMensual = new Decimal(e.auxilioTransporte)
  const totalDias = dias360(e.fechaIngreso, e.fechaRetiro)

  // ── Bases prestacionales ──
  // El auxilio de transporte no es salario, pero la Ley 1ª de 1963 (art. 7) lo
  // manda incluir en la base de cesantías y prima. En vacaciones no entra: se
  // pagan con el salario ordinario del descanso (CST art. 192), y el auxilio
  // existe para ir al trabajo.
  const baseCesantias = salarioBase.plus(auxilioMensual).plus(e.promedioVariableAnual)
  const basePrima = salarioBase.plus(auxilioMensual).plus(e.promedioVariableSemestre)
  const baseVacaciones = e.variableEnVacaciones ? salarioBase.plus(e.promedioVariableAnual) : salarioBase

  // ── Cesantías e intereses: desde el 1 de enero del año de retiro ──
  // Las de años anteriores ya se consignaron al fondo antes del 14 de febrero.
  const anioRetiro = e.fechaRetiro.getUTCFullYear()
  const inicioAnio = new Date(Date.UTC(anioRetiro, 0, 1))
  const corteCesantias = e.fechaIngreso > inicioAnio ? e.fechaIngreso : inicioAnio
  const diasCesantias = dias360(corteCesantias, e.fechaRetiro)

  const cesantias = baseCesantias.times(diasCesantias).dividedBy(360)
  const interesesCesantias = cesantias.times(e.porcentajeInteresesCesantias).times(diasCesantias).dividedBy(360)

  // ── Prima: días del semestre en curso ──
  // La del semestre anterior se pagó el 30 de junio; aquí solo va lo corrido.
  const mesRetiro = e.fechaRetiro.getUTCMonth()
  const inicioSemestre = new Date(Date.UTC(anioRetiro, mesRetiro < 6 ? 0 : 6, 1))
  const cortePrima = e.fechaIngreso > inicioSemestre ? e.fechaIngreso : inicioSemestre
  const diasPrima = dias360(cortePrima, e.fechaRetiro)
  const prima = basePrima.times(diasPrima).dividedBy(360)

  // ── Vacaciones compensadas en dinero ──
  const vacaciones = baseVacaciones.dividedBy(30).times(e.diasVacacionesPendientes)

  // ── Último tramo de salario ──
  const salario = salarioBase.dividedBy(30).times(e.diasSalarioPendiente)
  const auxilioTransporte = auxilioMensual.dividedBy(30).times(e.diasSalarioPendiente)
  const otroConceptoSalarial = new Decimal(e.otroConceptoSalarial)

  // ── Indemnización (solo sin justa causa / terminación anticipada) ──
  let indemnizacion = new Decimal(0)
  if (e.tipo === 'SIN_JUSTA_CAUSA' || e.tipo === 'TERMINACION_ANTICIPADA') {
    indemnizacion = calcularIndemnizacion(
      baseCesantias, baseCesantias.dividedBy(30), totalDias,
      e.tipoContrato, e.fechaRetiro, e.fechaFinContrato, e.smmlv,
    )
  }

  // ── Deducciones ──
  // Salud y pensión solo sobre lo que ES salario: el sueldo de los días
  // trabajados y la variable que se paga aquí. Ni el auxilio de transporte
  // (no es salario) ni las prestaciones cotizan.
  const baseSeguridadSocial = salario.plus(otroConceptoSalarial)
  const salud = baseSeguridadSocial.times(e.porcentajeSalud)
  const pension = baseSeguridadSocial.times(e.porcentajePension)
  const saldoPrestamo = new Decimal(e.saldoPrestamo)

  // Los totales suman las líneas YA redondeadas, no los decimales de atrás. Es
  // lo que hace cualquier colilla: si el contador suma a mano lo que ve, tiene
  // que darle el mismo total, y sumar por dentro y redondear al final deja
  // diferencias de un peso que parecen un error de cálculo.
  const lineasDevengadas = [salario, auxilioTransporte, otroConceptoSalarial, cesantias, interesesCesantias, prima, vacaciones, indemnizacion]
  const lineasDeducidas = [salud, pension, saldoPrestamo]
  const totalDevengado = lineasDevengadas.reduce((t, l) => t + peso(l), 0)
  const totalDeducciones = lineasDeducidas.reduce((t, l) => t + peso(l), 0)

  return {
    diasLiquidados: totalDias,
    diasSalario: e.diasSalarioPendiente,
    diasPrima,
    salario: peso(salario),
    auxilioTransporte: peso(auxilioTransporte),
    otroConceptoSalarial: peso(otroConceptoSalarial),
    cesantias: peso(cesantias),
    interesesCesantias: peso(interesesCesantias),
    prima: peso(prima),
    vacaciones: peso(vacaciones),
    indemnizacion: peso(indemnizacion),
    totalDevengado,
    salud: peso(salud),
    pension: peso(pension),
    saldoPrestamo: peso(saldoPrestamo),
    totalDeducciones,
    total: totalDevengado - totalDeducciones,
    baseCesantias: peso(baseCesantias),
    basePrima: peso(basePrima),
    baseVacaciones: peso(baseVacaciones),
    baseSeguridadSocial: peso(baseSeguridadSocial),
    salarioBaseLiquidacion: peso(baseCesantias),
    deducciones: totalDeducciones,
  }
}

function calcularIndemnizacion(
  base: Decimal, salarioDiario: Decimal, totalDias: number,
  tipoContrato: string, fechaRetiro: Date, fechaFinContrato: Date | null, smmlv: number,
): Decimal {
  if (tipoContrato === 'TERMINO_FIJO' || tipoContrato === 'OBRA_LABOR') {
    // Días que faltan hasta el fin del contrato (mínimo 15 días)
    const diasRestantes = fechaFinContrato ? Math.max(15, dias360(fechaRetiro, fechaFinContrato)) : 15
    return salarioDiario.times(diasRestantes)
  }
  // Indefinido (CST art. 64)
  const anios = totalDias / 360
  const menorA10SMMLV = base.lessThan(new Decimal(smmlv).times(10))
  if (menorA10SMMLV) {
    // 30 días primer año + 20 días por cada año adicional
    const adicionales = Math.max(0, anios - 1)
    return salarioDiario.times(30).plus(salarioDiario.times(20).times(adicionales))
  }
  // ≥10 SMMLV: 20 días primer año + 15 por año adicional
  const adicionales = Math.max(0, anios - 1)
  return salarioDiario.times(20).plus(salarioDiario.times(15).times(adicionales))
}
