import { describe, it, expect } from 'vitest'
import { diasSuperpuestos, pagoIncapacidad } from './ausencias'

const D = (m: number, d: number) => new Date(Date.UTC(2026, m - 1, d))

describe('diasSuperpuestos', () => {
  const inicio = D(7, 1)
  const fin = D(7, 31)

  it('ausencia completamente dentro del periodo', () => {
    expect(diasSuperpuestos(D(7, 5), D(7, 7), inicio, fin)).toBe(3)
  })

  it('un solo día', () => {
    expect(diasSuperpuestos(D(7, 10), D(7, 10), inicio, fin)).toBe(1)
  })

  it('ausencia que empieza antes del periodo se recorta', () => {
    expect(diasSuperpuestos(D(6, 28), D(7, 3), inicio, fin)).toBe(3) // 1,2,3 jul
  })

  it('ausencia que termina después del periodo se recorta', () => {
    expect(diasSuperpuestos(D(7, 30), D(8, 5), inicio, fin)).toBe(2) // 30,31 jul
  })

  it('sin fecha fin (suspensión abierta) cuenta hasta el fin del periodo', () => {
    expect(diasSuperpuestos(D(7, 20), null, inicio, fin)).toBe(12) // 20..31
  })

  it('fuera del periodo = 0', () => {
    expect(diasSuperpuestos(D(8, 1), D(8, 5), inicio, fin)).toBe(0)
  })
})

describe('pagoIncapacidad', () => {
  const SMMLV = 1_750_905

  it('66,67% del salario diario para salario alto', () => {
    // 3.000.000/30 = 100.000/día × 2/3 = 66.667/día × 3 días = 200.000
    expect(pagoIncapacidad(3, 3_000_000, SMMLV)).toBe(200_000)
  })

  it('piso: nunca por debajo del SMMLV diario', () => {
    // Mínimo: 58.363,5/día × 2/3 = 38.909 < piso 58.363,5 → paga el piso
    expect(pagoIncapacidad(3, SMMLV, SMMLV)).toBe(Math.round((SMMLV / 30) * 3))
  })

  it('0 días = 0', () => {
    expect(pagoIncapacidad(0, 3_000_000, SMMLV)).toBe(0)
  })
})
