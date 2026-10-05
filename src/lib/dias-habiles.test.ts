import { describe, it, expect } from 'vitest'
import {
  festivosDeRango, festivosDelAnio, esDiaHabil, sumarDiasHabiles, restarDiasHabiles, diasHabilesEntre, fechaAlerta,
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

// Calendario oficial (Ley 51 de 1983 + Ley 2578 de 2026). Si una ley crea o
// quita un festivo, esta lista se actualiza junto con LEYES_NUEVAS.
const OFICIAL: Record<number, string[]> = {
  2025: ['01-01', '01-06', '03-24', '04-17', '04-18', '05-01', '06-02', '06-23', '06-30', '07-20', '08-07', '08-18', '10-13', '11-03', '11-17', '12-08', '12-25'],
  2026: ['01-01', '01-12', '03-23', '04-02', '04-03', '05-01', '05-18', '06-08', '06-15', '06-29', '07-13', '07-20', '08-07', '08-17', '10-12', '11-02', '11-16', '12-08', '12-25'],
  2027: ['01-01', '01-11', '03-22', '03-25', '03-26', '05-01', '05-10', '05-31', '06-07', '07-05', '07-12', '07-20', '08-07', '08-16', '10-18', '11-01', '11-15', '12-08', '12-25'],
}

describe('calendario oficial de festivos', () => {
  for (const [anio, fechas] of Object.entries(OFICIAL)) {
    it(`${anio} coincide con el calendario oficial`, () => {
      const calc = [...festivosDeRango(Number(anio), Number(anio))].map((f) => f.slice(5)).sort()
      expect(calc).toEqual(fechas)
    })
  }

  it('la Virgen de Chiquinquirá (Ley 2578) rige desde 2026, no hacia atrás', () => {
    expect(festivosDeRango(2026, 2026).has('2026-07-13')).toBe(true)
    expect(festivosDeRango(2025, 2025).has('2025-07-14')).toBe(false)
    expect(festivosDelAnio(2026).find((f) => f.fecha === '2026-07-13')?.ley).toBe('Ley 2578 de 2026')
  })

  it('las excepciones agregan o quitan y se ven en la lista del año', () => {
    const lista = festivosDelAnio(2026, [
      { fecha: '2026-07-13', tipo: 'REMOVE' },
      { fecha: '2026-09-01', tipo: 'ADD', nombre: 'Decreto de prueba' },
    ])
    expect(lista.find((f) => f.fecha === '2026-07-13')?.origen).toBe('quitado')
    expect(lista.find((f) => f.fecha === '2026-09-01')).toMatchObject({ nombre: 'Decreto de prueba', origen: 'agregado' })
    expect(festivosDeRango(2026, 2026, [{ fecha: '2026-07-13', tipo: 'REMOVE' }]).has('2026-07-13')).toBe(false)
  })
})
