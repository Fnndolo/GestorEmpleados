import { describe, it, expect } from 'vitest'
import {
  festivosDeRango, esDiaHabil, sumarDiasHabiles, restarDiasHabiles, diasHabilesEntre, fechaAlerta,
} from './dias-habiles'
import { parseFechaISO } from './fechas'

const F = (s: string) => parseFechaISO(s)!
const festivos2026 = festivosDeRango(2025, 2027)

describe('días hábiles Colombia', () => {
  it('traslado Emiliani: Reyes Magos 2026 se observa el lunes 12-ene, no el 6-ene', () => {
    // 6-ene-2026 es martes y NO es festivo observado (se trasladó)
    expect(esDiaHabil(F('2026-01-06'), festivos2026)).toBe(true)
    // 12-ene-2026 es lunes y SÍ es el festivo observado
    expect(esDiaHabil(F('2026-01-12'), festivos2026)).toBe(false)
  })

  it('Año Nuevo no se traslada (cae fijo)', () => {
    expect(esDiaHabil(F('2026-01-01'), festivos2026)).toBe(false)
  })

  it('domingo nunca es hábil', () => {
    // 2026-06-14 es domingo
    expect(esDiaHabil(F('2026-06-14'), festivos2026)).toBe(false)
  })

  it('sábado es hábil por defecto, pero configurable', () => {
    // 2026-06-13 es sábado
    expect(esDiaHabil(F('2026-06-13'), festivos2026, true)).toBe(true)
    expect(esDiaHabil(F('2026-06-13'), festivos2026, false)).toBe(false)
  })

  it('restarDiasHabiles salta domingos y festivos', () => {
    // Desde el viernes 16-ene-2026, 3 días hábiles atrás (sábado cuenta):
    // jue 15, vie? no — contamos hacia atrás: 15(jue), 14(mié), 13(mar) → 13-ene
    const r = restarDiasHabiles(F('2026-01-16'), 3, festivos2026, true)
    expect(r.toISOString().slice(0, 10)).toBe('2026-01-13')
  })

  it('restarDiasHabiles sin sábados', () => {
    // Lunes 19-ene-2026, 1 día hábil atrás sin sábado → viernes 16-ene
    const r = restarDiasHabiles(F('2026-01-19'), 1, festivos2026, false)
    expect(r.toISOString().slice(0, 10)).toBe('2026-01-16')
  })

  it('sumarDiasHabiles', () => {
    // Viernes 16-ene + 1 hábil (sábado cuenta) → sábado 17
    expect(sumarDiasHabiles(F('2026-01-16'), 1, festivos2026, true).toISOString().slice(0, 10)).toBe('2026-01-17')
    // Viernes 16-ene + 1 hábil sin sábado → lunes 19
    expect(sumarDiasHabiles(F('2026-01-16'), 1, festivos2026, false).toISOString().slice(0, 10)).toBe('2026-01-19')
  })

  it('diasHabilesEntre excluye domingos', () => {
    // lunes 8-jun a viernes 12-jun 2026: mar,mié,jue,vie = 4 (sin contar lunes inicial)
    expect(diasHabilesEntre(F('2026-06-08'), F('2026-06-12'), festivos2026, false)).toBe(4)
  })

  it('fechaAlerta: 10 días hábiles antes (default global)', () => {
    const iso = fechaAlerta('2026-01-30', 10, true, festivos2026, true)
    // 30-ene viernes; 10 hábiles atrás contando sábados, saltando dom y festivos
    expect(typeof iso).toBe('string')
    expect(parseFechaISO(iso)!.getTime()).toBeLessThan(parseFechaISO('2026-01-30')!.getTime())
  })

  it('excepción ADD agrega un festivo decretado', () => {
    const conExcepcion = festivosDeRango(2026, 2026, [{ fecha: '2026-07-20', tipo: 'ADD' }])
    expect(conExcepcion.has('2026-07-20')).toBe(true)
  })
})
