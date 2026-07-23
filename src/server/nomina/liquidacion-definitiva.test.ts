import { describe, it, expect } from 'vitest'
import { liquidacionDefinitiva, type EntradaLiquidacionDef } from './liquidacion-definitiva'

const base: EntradaLiquidacionDef = {
  salarioBase: 3_000_000,
  promedioVariable: 0,
  fechaIngreso: new Date(Date.UTC(2026, 0, 1)),
  fechaRetiro: new Date(Date.UTC(2026, 6, 1)), // 1 de julio
  tipo: 'RENUNCIA',
  tipoContrato: 'TERMINO_INDEFINIDO',
  fechaFinContrato: null,
  diasVacacionesPendientes: 0,
  saldoPrestamo: 0,
  smmlv: 1_750_905,
}

describe('liquidación definitiva — convención 30/360', () => {
  it('un año exacto = 360 días (no 365 calendario)', () => {
    const r = liquidacionDefinitiva({
      ...base,
      fechaIngreso: new Date(Date.UTC(2025, 6, 1)),
      fechaRetiro: new Date(Date.UTC(2026, 6, 1)),
    })
    expect(r.diasLiquidados).toBe(360)
  })

  it('medio año (ene 1 → jul 1) = 180 días', () => {
    const r = liquidacionDefinitiva(base)
    expect(r.diasLiquidados).toBe(180)
  })

  it('cesantías de medio año = medio mes de salario (base × 180/360)', () => {
    const r = liquidacionDefinitiva(base)
    // 3.000.000 × 180/360 = 1.500.000 (con días reales daría 1.508.333, sobre-liquidado)
    expect(r.cesantias).toBe(1_500_000)
  })

  it('el día 31 se trata como 30 (no suma un día extra)', () => {
    const r = liquidacionDefinitiva({
      ...base,
      fechaIngreso: new Date(Date.UTC(2026, 0, 1)),
      fechaRetiro: new Date(Date.UTC(2026, 0, 31)),
    })
    // ene 1 → ene 31 (tratado como 30) = 29 días
    expect(r.diasLiquidados).toBe(29)
  })

  it('la variable promedio entra a la base prestacional', () => {
    const r = liquidacionDefinitiva({ ...base, promedioVariable: 500_000 })
    // base = 3.500.000 × 180/360 = 1.750.000
    expect(r.cesantias).toBe(1_750_000)
  })
})
