import { describe, it, expect } from 'vitest'
import { horasMesJornada, dividirDiurnoNocturno } from './horas'

describe('horasMesJornada (Ley 2101 / RIT art. 18)', () => {
  it('42h desde el 15-jul-2026 → 210', () => {
    expect(horasMesJornada(new Date('2026-07-15'))).toBe(210)
    expect(horasMesJornada(new Date('2026-12-01'))).toBe(210)
  })
  it('44h desde el 15-jul-2025 → 220', () => {
    expect(horasMesJornada(new Date('2025-07-15'))).toBe(220)
    expect(horasMesJornada(new Date('2026-07-14'))).toBe(220)
  })
  it('46h desde el 15-jul-2024 → 230', () => {
    expect(horasMesJornada(new Date('2024-08-01'))).toBe(230)
  })
  it('régimen anterior → 240', () => {
    expect(horasMesJornada(new Date('2022-01-01'))).toBe(240)
  })
})

describe('dividirDiurnoNocturno (Ley 2466: nocturno 19:00–06:00)', () => {
  it('rango totalmente diurno', () => {
    expect(dividirDiurnoNocturno('08:00', '12:00')).toEqual({ diurnas: 4, nocturnas: 0 })
  })
  it('rango totalmente nocturno', () => {
    expect(dividirDiurnoNocturno('20:00', '23:00')).toEqual({ diurnas: 0, nocturnas: 3 })
  })
  it('cruza las 7:00 p.m.', () => {
    expect(dividirDiurnoNocturno('17:00', '21:00')).toEqual({ diurnas: 2, nocturnas: 2 })
  })
  it('cruza la medianoche', () => {
    expect(dividirDiurnoNocturno('22:00', '02:00')).toEqual({ diurnas: 0, nocturnas: 4 })
  })
  it('termina después de las 6:00 a.m.', () => {
    expect(dividirDiurnoNocturno('04:00', '08:00')).toEqual({ diurnas: 2, nocturnas: 2 })
  })
  it('media hora nocturna', () => {
    expect(dividirDiurnoNocturno('18:30', '19:30')).toEqual({ diurnas: 0.5, nocturnas: 0.5 })
  })
})
