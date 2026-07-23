import Decimal from 'decimal.js'

Decimal.set({ rounding: Decimal.ROUND_HALF_UP })

export type EntradaLiquidacionDef = {
  salarioBase: number
  promedioVariable: number // promedio mensual de comisiones/variable
  fechaIngreso: Date
  fechaRetiro: Date
  tipo: string // TipoTerminacion
  tipoContrato: 'TERMINO_FIJO' | 'TERMINO_INDEFINIDO' | 'OBRA_LABOR' | string
  fechaFinContrato: Date | null
  diasVacacionesPendientes: number
  saldoPrestamo: number
  smmlv: number
}

export type ResultadoLiquidacionDef = {
  diasLiquidados: number
  salarioBaseLiquidacion: number
  cesantias: number
  interesesCesantias: number
  prima: number
  vacaciones: number
  indemnizacion: number
  deducciones: number
  total: number
}

const peso = (d: Decimal) => d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()

/**
 * Días entre dos fechas por la convención comercial 30/360 que usa la liquidación
 * laboral en Colombia (meses de 30 días, año de 360). NO usar días calendario
 * reales: sobre-liquidaría cesantías/prima/vacaciones ~1,4% (365/360).
 */
function dias360(desde: Date, hasta: Date): number {
  if (hasta <= desde) return 0
  let d1 = desde.getUTCDate()
  let d2 = hasta.getUTCDate()
  if (d1 === 31) d1 = 30
  if (d2 === 31) d2 = 30
  const meses = (hasta.getUTCFullYear() - desde.getUTCFullYear()) * 12 + (hasta.getUTCMonth() - desde.getUTCMonth())
  return Math.max(0, meses * 30 + (d2 - d1))
}

/** Calcula la liquidación definitiva (cesantías, intereses, prima, vacaciones, indemnización). */
export function liquidacionDefinitiva(e: EntradaLiquidacionDef): ResultadoLiquidacionDef {
  // Base salarial = salario + promedio de variable (para prestaciones)
  const base = new Decimal(e.salarioBase).plus(e.promedioVariable)
  const salarioDiario = base.dividedBy(30)
  const totalDias = dias360(e.fechaIngreso, e.fechaRetiro)

  // Corte para cesantías y prima = inicio del año de retiro (o ingreso si posterior)
  const anioRetiro = e.fechaRetiro.getUTCFullYear()
  const inicioAnio = new Date(Date.UTC(anioRetiro, 0, 1))
  const corteCesantias = e.fechaIngreso > inicioAnio ? e.fechaIngreso : inicioAnio
  const diasCesantias = dias360(corteCesantias, e.fechaRetiro)

  const cesantias = base.times(diasCesantias).dividedBy(360)
  const interesesCesantias = cesantias.times(0.12).times(diasCesantias).dividedBy(360)

  // Prima: días del semestre en curso
  const mesRetiro = e.fechaRetiro.getUTCMonth()
  const inicioSemestre = new Date(Date.UTC(anioRetiro, mesRetiro < 6 ? 0 : 6, 1))
  const corterPrima = e.fechaIngreso > inicioSemestre ? e.fechaIngreso : inicioSemestre
  const diasPrima = dias360(corterPrima, e.fechaRetiro)
  const prima = base.times(diasPrima).dividedBy(360)

  // Vacaciones compensadas
  const vacaciones = salarioDiario.times(e.diasVacacionesPendientes)

  // Indemnización (solo sin justa causa / terminación anticipada)
  let indemnizacion = new Decimal(0)
  if (e.tipo === 'SIN_JUSTA_CAUSA' || e.tipo === 'TERMINACION_ANTICIPADA') {
    indemnizacion = calcularIndemnizacion(base, salarioDiario, totalDias, e.tipoContrato, e.fechaRetiro, e.fechaFinContrato, e.smmlv)
  }

  const totalDevengado = cesantias.plus(interesesCesantias).plus(prima).plus(vacaciones).plus(indemnizacion)
  const deducciones = new Decimal(e.saldoPrestamo)
  const total = totalDevengado.minus(deducciones)

  return {
    diasLiquidados: totalDias,
    salarioBaseLiquidacion: peso(base),
    cesantias: peso(cesantias),
    interesesCesantias: peso(interesesCesantias),
    prima: peso(prima),
    vacaciones: peso(vacaciones),
    indemnizacion: peso(indemnizacion),
    deducciones: peso(deducciones),
    total: peso(total),
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
