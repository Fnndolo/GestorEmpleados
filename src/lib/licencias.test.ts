import { describe, it, expect } from 'vitest'
import { LICENCIAS, defLicencia, esDerecho } from './licencias'

describe('catálogo de licencias', () => {
  it('no tiene tipos duplicados', () => {
    const tipos = LICENCIAS.map((l) => l.tipo)
    expect(new Set(tipos).size).toBe(tipos.length)
  })

  it('toda licencia tiene fundamento y etiqueta', () => {
    for (const l of LICENCIAS) {
      expect(l.label.length, l.tipo).toBeGreaterThan(0)
      expect(l.fundamento.length, l.tipo).toBeGreaterThan(0)
    }
  })

  it('defLicencia falla ante un tipo desconocido', () => {
    expect(() => defLicencia('INVENTADA')).toThrow()
  })
})

describe('licencias que concede la ley (no se aprueban, se registran)', () => {
  // Si alguna de estas deja de ser un derecho, el flujo la mandaría al jefe
  // inmediato y negarla sería una falta del empleador. Por eso se fija aquí.
  it.each([
    ['LUTO', 5],
    ['MATERNIDAD', 126],
    ['PATERNIDAD', 14],
    ['CALAMIDAD', null],
    ['DIA_COMPENSATORIO_VOTACION', 0.5],
    ['MATRIMONIO', 3],
  ] as const)('%s es un derecho, remunerada, con %s día(s) de ley', (tipo, diasLey) => {
    const d = defLicencia(tipo)
    expect(esDerecho(tipo)).toBe(true)
    expect(d.remunerada).toBe(true)
    expect(d.diasLey).toBe(diasLey)
    expect(d.requiereSoporte).toBe(true) // un derecho se acredita con soporte
  })

  // Excepción: es un derecho y remunerado, pero no lleva soporte (la fecha la
  // coordina el jefe, no hay documento que acreditarlo).
  it('día de la familia es un derecho remunerado sin soporte', () => {
    const d = defLicencia('DIA_DE_LA_FAMILIA')
    expect(esDerecho('DIA_DE_LA_FAMILIA')).toBe(true)
    expect(d.remunerada).toBe(true)
    expect(d.diasLey).toBe(1)
    expect(d.requiereSoporte).toBe(false)
  })

  it('el luto son 5 días de ley', () => {
    expect(defLicencia('LUTO').diasLey).toBe(5)
  })

  it('maternidad son 18 semanas = 126 días', () => {
    expect(defLicencia('MATERNIDAD').diasLey).toBe(18 * 7)
  })

  it('paternidad son 2 semanas = 14 días', () => {
    expect(defLicencia('PATERNIDAD').diasLey).toBe(2 * 7)
  })
})

describe('licencias discrecionales (sí las decide el empleador)', () => {
  it.each(['ESTUDIO', 'NO_REMUNERADA', 'OTRA'] as const)(
    '%s no es un derecho de ley',
    (tipo) => expect(esDerecho(tipo)).toBe(false),
  )

  it('la licencia no remunerada no se paga (Art. 51 CST)', () => {
    expect(defLicencia('NO_REMUNERADA').remunerada).toBe(false)
  })

  it('es la única no remunerada del catálogo', () => {
    const noPagas = LICENCIAS.filter((l) => !l.remunerada).map((l) => l.tipo)
    expect(noPagas).toEqual(['NO_REMUNERADA'])
  })
})
