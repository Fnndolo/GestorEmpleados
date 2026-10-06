import { describe, expect, it } from 'vitest'
import { crucesDeTurnos, diasEspecialesDelMes, domingosPorPersona, mesesVecinos, sugerirReparto } from './cronograma'

// Noviembre de 2026: domingos 1, 8, 15, 22 y 29; festivos lunes 2 y 16.
const festivos = new Set(['2026-11-02', '2026-11-16'])
const noviembre = diasEspecialesDelMes('2026-11', festivos)

describe('días especiales', () => {
  it('lista los domingos y festivos del mes en orden', () => {
    expect(noviembre.map((d) => d.fecha.slice(8))).toEqual(['01', '02', '08', '15', '16', '22', '29'])
    expect(noviembre[1]).toEqual({ fecha: '2026-11-02', domingo: false, festivo: true })
  })

  it('cruza el año', () => {
    expect(mesesVecinos('2027-01')).toEqual({ anterior: '2026-12', siguiente: '2027-02' })
  })
})

describe('regla: nadie en dos domingos/festivos seguidos', () => {
  const secuencia = ['2026-10-25', ...noviembre.map((d) => d.fecha), '2026-12-06']

  it('detecta el domingo y el lunes festivo, y dos domingos seguidos', () => {
    expect(crucesDeTurnos({ ana: ['2026-11-01', '2026-11-02'] }, secuencia)).toHaveLength(1)
    expect(crucesDeTurnos({ ana: ['2026-11-22', '2026-11-29'] }, secuencia)).toHaveLength(1)
    expect(crucesDeTurnos({ ana: ['2026-11-01', '2026-11-08'] }, secuencia)).toHaveLength(0)
  })

  it('mira los bordes del mes', () => {
    expect(crucesDeTurnos({ ana: ['2026-10-25', '2026-11-01'] }, secuencia)).toEqual([{ colaboradorId: 'ana', fechas: ['2026-10-25', '2026-11-01'] }])
  })
})

describe('reparto sugerido', () => {
  it('intercala, reparte parejo y respeta los bordes', () => {
    const { turnos, faltan } = sugerirReparto({
      especiales: noviembre, personas: ['a', 'b', 'c', 'd'], porDia: 2, antes: new Set(['a']),
    })
    expect(faltan).toEqual([])
    const secuencia = ['2026-10-25', ...noviembre.map((d) => d.fecha)]
    expect(crucesDeTurnos({ ...turnos, a: [...turnos.a, '2026-10-25'] }, secuencia)).toEqual([])
    expect(turnos.a).not.toContain('2026-11-01')
    const cuantos = Object.values(turnos).map((f) => f.length)
    expect(Math.max(...cuantos) - Math.min(...cuantos)).toBeLessThanOrEqual(1)
  })

  it('al azar entre parejos: varía de una vez a otra, sin romper la regla ni el reparto parejo', () => {
    // Generador con semilla: la prueba siempre da lo mismo.
    const semilla = (n: number) => () => { n = (n * 16807) % 2147483647; return (n - 1) / 2147483646 }
    const personas = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    const secuencia = noviembre.map((d) => d.fecha)
    const distintos = new Set<string>()
    for (let i = 1; i <= 40; i++) {
      const { turnos, faltan } = sugerirReparto({ especiales: noviembre, personas, porDia: 2, azar: semilla(i) })
      expect(faltan).toEqual([])
      expect(crucesDeTurnos(turnos, secuencia)).toEqual([])
      const cuantos = Object.values(turnos).map((f) => f.length)
      expect(Math.max(...cuantos) - Math.min(...cuantos)).toBeLessThanOrEqual(1)
      distintos.add(JSON.stringify(turnos))
    }
    expect(distintos.size).toBeGreaterThan(20)
  })

  it('con dos por día no repite las mismas parejas', () => {
    const semilla = (n: number) => () => { n = (n * 16807) % 2147483647; return (n - 1) / 2147483646 }
    const personas = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']
    for (let i = 1; i <= 40; i++) {
      const { turnos } = sugerirReparto({ especiales: noviembre, personas, porDia: 2, azar: semilla(i) })
      const parejas = new Map<string, number>()
      for (const d of noviembre) {
        const dia = personas.filter((p) => turnos[p].includes(d.fecha))
        const k = dia.join('|'); parejas.set(k, (parejas.get(k) ?? 0) + 1)
      }
      expect(Math.max(...parejas.values())).toBe(1)
    }
  })

  it('si no alcanza la gente, dice cuántos faltan', () => {
    const { faltan } = sugerirReparto({ especiales: noviembre.slice(0, 2), personas: ['a', 'b', 'c'], porDia: 2 })
    expect(faltan).toEqual([{ fecha: '2026-11-02', faltan: 1 }])
  })

  it('cuenta los domingos (no los festivos) para el trabajo dominical habitual', () => {
    expect(domingosPorPersona({ ana: ['2026-11-01', '2026-11-16', '2026-11-29'] }, noviembre)).toEqual({ ana: 2 })
  })
})
