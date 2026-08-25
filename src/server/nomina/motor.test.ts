import { describe, it, expect } from 'vitest'
import { liquidar, retencionFuente, type EntradaLiquidacion } from './motor'
import Decimal from 'decimal.js'

// Parámetros 2026 (espejo del seed)
const P2026 = {
  SMMLV: 1_750_905, AUX_TRANSPORTE: 249_095, UVT: 52_480,
  SALUD_EMPLEADO: 0.04, SALUD_EMPLEADOR: 0.085, PENSION_EMPLEADO: 0.04, PENSION_EMPLEADOR: 0.12,
  CAJA: 0.04, SENA: 0.02, ICBF: 0.03,
  ARL_I: 0.00522, ARL_V: 0.0696,
  CESANTIAS: 0.0833, INTERESES_CESANTIAS: 0.12, PRIMA: 0.0833, VACACIONES: 0.0417,
  FSP: 0.01, EXONERACION_SMMLV: 10, AUX_TRANSPORTE_TOPE_SMMLV: 2,
}

const base: EntradaLiquidacion = {
  salarioBase: 1_750_905, tipoSalario: 'ORDINARIO', tieneAuxTransporte: true, auxConectividad: 0,
  diasTrabajados: 30, diasPeriodo: 30,
  valorHorasExtra: 0, comisiones: 0, bonificacionConstitutiva: 0, bonificacionNoConstitutiva: 0,
  valorIncapacidad: 0, cuotaPrestamo: 0, claseRiesgoArl: 'I', empresaExonerada: false,
  aplicaRetefuente: false, parametros: P2026,
}

const linea = (r: ReturnType<typeof liquidar>, codigo: string) => r.lineas.find((l) => l.codigo === codigo)

describe('motor de nómina', () => {
  it('salario mínimo 2026 con auxilio de transporte, mes completo', () => {
    const r = liquidar(base)
    expect(linea(r, 'SALARIO')?.valor).toBe(1_750_905)
    expect(linea(r, 'AUX_TRANSPORTE')?.valor).toBe(249_095)
    expect(r.totalDevengado).toBe(2_000_000)
    // IBC redondeado a la centena hacia arriba
    expect(r.ibc).toBe(1_750_900)
    expect(linea(r, 'SALUD_EMP')?.valor).toBe(70_036)
    expect(linea(r, 'PENSION_EMP')?.valor).toBe(70_036)
    // No hay FSP (IBC < 4 SMMLV)
    expect(linea(r, 'FSP_EMP')).toBeUndefined()
    expect(r.totalDeducido).toBe(140_072)
    expect(r.neto).toBe(1_859_928)
  })

  it('el auxilio de transporte no entra al IBC', () => {
    const r = liquidar(base)
    // IBC = salario, no incluye auxilio
    expect(r.ibc).toBe(1_750_900)
  })

  it('salario > 2 SMMLV no recibe auxilio de transporte', () => {
    const r = liquidar({ ...base, salarioBase: 4_000_000 })
    expect(linea(r, 'AUX_TRANSPORTE')).toBeUndefined()
  })

  it('cuadre contable: devengado − deducido = neto', () => {
    const r = liquidar({ ...base, salarioBase: 3_000_000, valorHorasExtra: 200_000, comisiones: 500_000, cuotaPrestamo: 150_000 })
    expect(r.totalDevengado - r.totalDeducido).toBe(r.neto)
  })

  it('exoneración Ley 114-1: sin aporte de salud, SENA ni ICBF para salarios < 10 SMMLV', () => {
    const r = liquidar({ ...base, salarioBase: 2_000_000, empresaExonerada: true })
    expect(linea(r, 'APORTE_SALUD')).toBeUndefined()
    expect(linea(r, 'APORTE_SENA')).toBeUndefined()
    expect(linea(r, 'APORTE_ICBF')).toBeUndefined()
    // Pensión, ARL y caja sí se aportan
    expect(linea(r, 'APORTE_PENSION')).toBeDefined()
    expect(linea(r, 'APORTE_CAJA')).toBeDefined()
  })

  it('no exonerada: aporta salud, SENA e ICBF', () => {
    const r = liquidar({ ...base, salarioBase: 2_000_000, empresaExonerada: false })
    expect(linea(r, 'APORTE_SALUD')).toBeDefined()
    expect(linea(r, 'APORTE_SENA')).toBeDefined()
    expect(linea(r, 'APORTE_ICBF')).toBeDefined()
  })

  it('FSP se aplica cuando el IBC mensual ≥ 4 SMMLV', () => {
    // 4 SMMLV 2026 ≈ 7.003.620; usamos 8.000.000 para superar el umbral
    const r = liquidar({ ...base, salarioBase: 8_000_000 })
    expect(linea(r, 'FSP_EMP')).toBeDefined()
    expect(linea(r, 'FSP_EMP')?.valor).toBeGreaterThan(0)
  })

  it('horas extra entran al IBC y a devengados', () => {
    const sinHE = liquidar(base)
    const conHE = liquidar({ ...base, valorHorasExtra: 300_000 })
    expect(conHE.totalDevengado).toBe(sinHE.totalDevengado + 300_000)
    expect(conHE.ibc).toBeGreaterThan(sinHE.ibc)
  })

  it('ingreso a mitad de mes (15 días) proporciona salario y auxilio', () => {
    const r = liquidar({ ...base, diasTrabajados: 15 })
    expect(linea(r, 'SALARIO')?.valor).toBe(875_453) // 1.750.905 / 30 × 15 = 875.452,5 → 875.453
    expect(linea(r, 'AUX_TRANSPORTE')?.valor).toBe(124_548) // 249.095/30×15 = 124.547,5 → 124.548
  })

  it('liquidar dos veces el mismo periodo da el mismo resultado (idempotencia)', () => {
    const r1 = liquidar(base)
    const r2 = liquidar(base)
    expect(r1.neto).toBe(r2.neto)
    expect(r1.ibc).toBe(r2.ibc)
    expect(JSON.stringify(r1.lineas)).toBe(JSON.stringify(r2.lineas))
  })

  it('salario integral: IBC = 70% del salario', () => {
    const r = liquidar({ ...base, salarioBase: 15_000_000, tipoSalario: 'INTEGRAL' })
    // 70% de 15M = 10.5M (redondeado a centena)
    expect(r.ibc).toBe(10_500_000)
    expect(linea(r, 'AUX_TRANSPORTE')).toBeUndefined() // integral no recibe auxilio
  })

  it('retención en la fuente: salario bajo no genera retención', () => {
    expect(retencionFuente(new Decimal(2_000_000), 52_480)).toBe(0)
  })

  it('retención en la fuente: base alta sí genera retención', () => {
    expect(retencionFuente(new Decimal(12_000_000), 52_480)).toBeGreaterThan(0)
  })
})

describe('vacaciones pagadas por adelantado (RIT arts. 34 y 42)', () => {
  it('genera la línea devengada y entra al IBC', () => {
    const r = liquidar({ ...base, salarioBase: 3_000_000, tieneAuxTransporte: false, valorVacacionesAnticipadas: 1_200_000 })
    expect(linea(r, 'VACACIONES_ANTICIPADAS')?.valor).toBe(1_200_000)
    // IBC = salario (3.000.000) + vacaciones anticipadas (1.200.000), redondeado a la centena
    expect(r.ibc).toBe(4_200_000)
    expect(r.totalDevengado - r.totalDeducido).toBe(r.neto)
  })

  it('sin valor no genera línea', () => {
    const r = liquidar(base)
    expect(linea(r, 'VACACIONES_ANTICIPADAS')).toBeUndefined()
  })
})

describe('conceptos configurables (arts. 127/128 CST)', () => {
  const auxNoConstitutivo = {
    codigo: 'AUX_ALIMENTACION', nombre: 'Auxilio de alimentación', tipo: 'DEVENGADO' as const,
    valor: 300_000, afectaIbcSs: false, basePrestaciones: false, baseVacaciones: false,
  }
  const primaConstitutiva = {
    codigo: 'PRIMA_EXTRALEGAL', nombre: 'Prima extralegal', tipo: 'DEVENGADO' as const,
    valor: 300_000, afectaIbcSs: true, basePrestaciones: true, baseVacaciones: true,
  }
  const descuento = {
    codigo: 'DESC_GIMNASIO', nombre: 'Descuento gimnasio', tipo: 'DEDUCCION' as const,
    valor: 50_000, afectaIbcSs: false, basePrestaciones: false, baseVacaciones: false,
  }

  it('no constitutivo: suma al neto sin tocar el IBC', () => {
    const sin = liquidar({ ...base, salarioBase: 3_000_000, tieneAuxTransporte: false })
    const con = liquidar({ ...base, salarioBase: 3_000_000, tieneAuxTransporte: false, otrosConceptos: [auxNoConstitutivo] })
    expect(con.ibc).toBe(sin.ibc)
    expect(con.totalDevengado - sin.totalDevengado).toBe(300_000)
    expect(con.neto - sin.neto).toBe(300_000) // sin deducciones adicionales
  })

  it('constitutivo: entra al IBC y a las provisiones', () => {
    const sin = liquidar({ ...base, salarioBase: 3_000_000, tieneAuxTransporte: false })
    const con = liquidar({ ...base, salarioBase: 3_000_000, tieneAuxTransporte: false, otrosConceptos: [primaConstitutiva] })
    expect(con.ibc - sin.ibc).toBe(300_000)
    // Salud y pensión del empleado suben 4% + 4% de los 300.000
    expect(con.totalDeducido - sin.totalDeducido).toBe(24_000)
    expect(con.totalProvisiones).toBeGreaterThan(sin.totalProvisiones)
  })

  it('deducción configurable: descuenta del neto', () => {
    const sin = liquidar(base)
    const con = liquidar({ ...base, otrosConceptos: [descuento] })
    expect(sin.neto - con.neto).toBe(50_000)
    expect(con.totalDevengado).toBe(sin.totalDevengado)
  })
})

describe('ingreso y retiro a mitad de periodo', () => {
  // Caso real: colaborador creado con ingreso el 15 de julio. El periodo son 30
  // días y el vínculo cubre 16, así que salario y auxilio salen proporcionales.
  // Antes de prorratear, este mismo caso pagaba el mes entero ($2.000.000).
  it('16 días: salario y auxilio proporcionales, no el mes completo', () => {
    const r = liquidar({ ...base, diasTrabajados: 16 })
    expect(linea(r, 'SALARIO')?.valor).toBe(933_816)
    expect(linea(r, 'AUX_TRANSPORTE')?.valor).toBe(132_851)
    expect(r.totalDevengado).toBe(1_066_667)
    expect(r.totalDevengado).toBeLessThan(2_000_000)
  })

  it('el piso del IBC también es proporcional a los días', () => {
    const r = liquidar({ ...base, diasTrabajados: 16 })
    // Piso = 1 SMMLV proporcional a 16 días, no el SMMLV completo.
    expect(r.ibc).toBeLessThan(1_750_905)
    expect(r.ibc).toBeGreaterThan(900_000)
  })
})
