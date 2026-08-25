import { describe, it, expect } from 'vitest'
import { liquidacionDefinitiva, dias360, type EntradaLiquidacionDef } from './liquidacion-definitiva'

const D = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d))

const base: EntradaLiquidacionDef = {
  salarioBase: 1_750_905,
  auxilioTransporte: 0,
  promedioVariableAnual: 0,
  promedioVariableSemestre: 0,
  otroConceptoSalarial: 0,
  diasSalarioPendiente: 0,
  variableEnVacaciones: false,
  fechaIngreso: D(2026, 1, 15),
  fechaRetiro: D(2026, 7, 31),
  tipo: 'RENUNCIA_VOLUNTARIA',
  tipoContrato: 'TERMINO_INDEFINIDO',
  fechaFinContrato: null,
  diasVacacionesPendientes: 0,
  saldoPrestamo: 0,
  smmlv: 1_750_905,
  porcentajeSalud: 0.04,
  porcentajePension: 0.04,
  porcentajeInteresesCesantias: 0.12,
}

describe('dias360', () => {
  it('el día 31 cuenta como corte, no se recorta a 30', () => {
    // 15 de enero → 31 de julio: 6 meses × 30 + (31 − 15) = 196
    expect(dias360(D(2026, 1, 15), D(2026, 7, 31))).toBe(196)
  })

  it('mes completo terminando el 31', () => {
    expect(dias360(D(2026, 7, 1), D(2026, 7, 31))).toBe(30)
  })

  it('el día 31 sí se recorta cuando es la fecha de inicio', () => {
    expect(dias360(D(2026, 1, 31), D(2026, 2, 28))).toBe(28)
  })

  it('fecha de corte anterior al ingreso da cero', () => {
    expect(dias360(D(2026, 8, 1), D(2026, 7, 31))).toBe(0)
  })
})

/**
 * Caso de referencia: la liquidación real de un colaborador que ingresó el 15 de
 * enero de 2026 y salió el 31 de julio, liquidada por el software contable de la
 * empresa. Cada cifra de este bloque está tomada de esa colilla — si el sistema
 * deja de reproducirla, cambió algo que el contador no aprobó.
 */
describe('liquidación definitiva · colilla de referencia', () => {
  const real: EntradaLiquidacionDef = {
    ...base,
    auxilioTransporte: 249_095,
    promedioVariableAnual: 234_930, // promedio del tiempo servido (196 días)
    promedioVariableSemestre: 879_400, // promedio del semestre en curso (julio)
    otroConceptoSalarial: 933_740, // comisiones de julio, sin pagar por nómina
    diasSalarioPendiente: 30, // julio entero quedó fuera del ciclo mensual
    diasVacacionesPendientes: 196 * (15 / 360), // 8,1666 días causados, ninguno disfrutado
  }
  const r = liquidacionDefinitiva(real)

  it('días liquidados', () => {
    expect(r.diasLiquidados).toBe(196)
  })

  it('salario y auxilio del último mes', () => {
    expect(r.salario).toBe(1_750_905)
    expect(r.auxilioTransporte).toBe(249_095)
  })

  it('cesantías sobre base con auxilio y promedio anual', () => {
    expect(r.baseCesantias).toBe(2_234_930)
    expect(r.cesantias).toBe(1_216_795)
  })

  it('intereses: 12% anual proporcional a los días', () => {
    // La colilla trae 79.498; el valor exacto de la fórmula es 79.497,01. El
    // peso de diferencia es redondeo interno del software contable.
    expect(Math.abs(r.interesesCesantias - 79_498)).toBeLessThanOrEqual(1)
  })

  it('prima sobre el semestre, con su propio promedio', () => {
    expect(r.basePrima).toBe(2_879_400)
    expect(r.diasPrima).toBe(30)
    expect(r.prima).toBe(239_950)
  })

  it('vacaciones sobre el salario ordinario, sin auxilio', () => {
    // 1.750.905 ÷ 30 × 8,1666 = 476.635,25 exactos; la colilla muestra 476.636.
    expect(r.baseVacaciones).toBe(1_750_905)
    expect(Math.abs(r.vacaciones - 476_636)).toBeLessThanOrEqual(1)
  })

  it('salud y pensión solo sobre lo salarial', () => {
    // Ni el auxilio de transporte ni las prestaciones cotizan.
    expect(r.baseSeguridadSocial).toBe(2_684_645)
    expect(r.salud).toBe(107_386)
    expect(r.pension).toBe(107_386)
    expect(r.totalDeducciones).toBe(214_772)
  })

  it('los días de vacaciones NO se redondean antes de pagarlos', () => {
    // El saldo se muestra en pantalla a dos decimales (8,17 días), pero pagar
    // sobre esa cifra recortada inflaba la liquidación en $195.
    const redondeado = liquidacionDefinitiva({ ...real, diasVacacionesPendientes: 8.17 })
    expect(redondeado.vacaciones - r.vacaciones).toBe(195)
    expect(redondeado.total).not.toBe(4_731_845)
  })

  it('totales', () => {
    // La colilla suma 3.195.712 de ingresos adicionales; el redondeo por línea
    // deja hasta dos pesos de diferencia contra sumar y redondear al final.
    const ingresosAdicionales = r.totalDevengado - r.salario
    expect(Math.abs(ingresosAdicionales - 3_195_712)).toBeLessThanOrEqual(2)
    expect(Math.abs(r.total - 4_731_845)).toBeLessThanOrEqual(2)
  })
})

describe('liquidación definitiva · reglas', () => {
  it('sin variable ni auxilio, la base es el salario', () => {
    const r = liquidacionDefinitiva(base)
    expect(r.baseCesantias).toBe(1_750_905)
    expect(r.cesantias).toBe(peso(1_750_905 * 196 / 360))
  })

  it('el auxilio de transporte entra a cesantías y prima pero no a vacaciones', () => {
    const r = liquidacionDefinitiva({ ...base, auxilioTransporte: 249_095, diasVacacionesPendientes: 10 })
    expect(r.baseCesantias).toBe(2_000_000)
    expect(r.basePrima).toBe(2_000_000)
    expect(r.baseVacaciones).toBe(1_750_905)
  })

  it('el variable entra a vacaciones solo si así se configura', () => {
    const sin = liquidacionDefinitiva({ ...base, promedioVariableAnual: 500_000 })
    const con = liquidacionDefinitiva({ ...base, promedioVariableAnual: 500_000, variableEnVacaciones: true })
    expect(sin.baseVacaciones).toBe(1_750_905)
    expect(con.baseVacaciones).toBe(2_250_905)
  })

  it('cesantías y prima usan promedios distintos', () => {
    const r = liquidacionDefinitiva({ ...base, promedioVariableAnual: 100_000, promedioVariableSemestre: 800_000 })
    expect(r.baseCesantias).toBe(1_850_905)
    expect(r.basePrima).toBe(2_550_905)
  })

  it('si la nómina ya pagó el mes, no se paga salario aquí', () => {
    const r = liquidacionDefinitiva({ ...base, diasSalarioPendiente: 0, auxilioTransporte: 249_095 })
    expect(r.salario).toBe(0)
    expect(r.auxilioTransporte).toBe(0)
    expect(r.baseSeguridadSocial).toBe(0)
    expect(r.salud).toBe(0)
  })

  it('sin salario ni variable pendientes no hay deducción de seguridad social', () => {
    const r = liquidacionDefinitiva({ ...base, diasVacacionesPendientes: 10 })
    expect(r.salud).toBe(0)
    expect(r.pension).toBe(0)
    expect(r.total).toBe(r.totalDevengado)
  })

  it('el saldo del préstamo se descuenta', () => {
    const r = liquidacionDefinitiva({ ...base, saldoPrestamo: 300_000 })
    expect(r.totalDeducciones).toBe(300_000)
  })

  it('renuncia voluntaria no genera indemnización', () => {
    expect(liquidacionDefinitiva(base).indemnizacion).toBe(0)
  })

  it('sin justa causa en indefinido: 30 días el primer año', () => {
    const r = liquidacionDefinitiva({ ...base, tipo: 'SIN_JUSTA_CAUSA' })
    expect(r.indemnizacion).toBe(peso((1_750_905 / 30) * 30))
  })

  it('término fijo: se indemnizan los días que faltaban, mínimo 15', () => {
    const r = liquidacionDefinitiva({
      ...base, tipo: 'SIN_JUSTA_CAUSA', tipoContrato: 'TERMINO_FIJO', fechaFinContrato: D(2026, 12, 31),
    })
    // 31 de julio → 31 de diciembre son 151 días por la convención 30/360.
    expect(r.indemnizacion).toBe(peso((1_750_905 / 30) * 151))
  })

  it('retiro el mismo día del ingreso: todo en cero', () => {
    const r = liquidacionDefinitiva({ ...base, fechaRetiro: D(2026, 1, 15) })
    expect(r.diasLiquidados).toBe(0)
    expect(r.cesantias).toBe(0)
    expect(r.total).toBe(0)
  })
})

const peso = (n: number) => Math.round(n)
