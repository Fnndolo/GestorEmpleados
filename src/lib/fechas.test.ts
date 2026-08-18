import { describe, it, expect } from 'vitest'
import { duracionContrato } from './fechas'

/** Fecha de negocio (sin hora), como las guarda Prisma con @db.Date. */
const f = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

describe('duracionContrato', () => {
  it('sin fecha de fin es indefinido', () => {
    expect(duracionContrato(f('2026-01-01'), null)).toBe('Indefinido')
  })

  it('cuenta el último día: 1-ene a 30-jun son 6 meses', () => {
    expect(duracionContrato(f('2026-01-01'), f('2026-06-30'))).toBe('6 meses')
  })

  it('un año exacto', () => {
    expect(duracionContrato(f('2026-01-01'), f('2026-12-31'))).toBe('1 año')
  })

  it('mezcla años y meses', () => {
    expect(duracionContrato(f('2025-01-01'), f('2026-02-28'))).toBe('1 año, 2 meses')
  })

  it('deja los días sueltos que sobran', () => {
    expect(duracionContrato(f('2026-01-01'), f('2026-03-15'))).toBe('2 meses, 15 días')
  })

  it('un solo día', () => {
    expect(duracionContrato(f('2026-01-01'), f('2026-01-01'))).toBe('1 día')
  })

  it('respeta meses de distinta longitud (febrero)', () => {
    expect(duracionContrato(f('2026-02-01'), f('2026-02-28'))).toBe('1 mes')
  })

  it('sin fecha de inicio no calcula', () => {
    expect(duracionContrato(null, f('2026-06-30'))).toBe('')
  })

  it('fin anterior al inicio no calcula', () => {
    expect(duracionContrato(f('2026-06-30'), f('2026-01-01'))).toBe('')
  })
})
