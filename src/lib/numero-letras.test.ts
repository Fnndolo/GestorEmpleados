import { describe, expect, it } from 'vitest'
import { numeroALetras, pesosALetras } from './numero-letras'

describe('pesosALetras', () => {
  it('los millones exactos llevan «de» (como en la cuenta de cobro del Word)', () => {
    expect(pesosALetras(1_000_000)).toBe('UN MILLÓN DE PESOS M/CTE ($1.000.000)')
    expect(pesosALetras(2_000_000)).toBe('DOS MILLONES DE PESOS M/CTE ($2.000.000)')
    expect(pesosALetras(1_500_000)).toBe('UN MILLÓN QUINIENTOS MIL PESOS M/CTE ($1.500.000)')
  })

  it('«uno» se apocopa delante de mil, millones y pesos', () => {
    expect(pesosALetras(1)).toBe('UN PESO M/CTE ($1)')
    expect(pesosALetras(21)).toBe('VEINTIÚN PESOS M/CTE ($21)')
    expect(pesosALetras(21_000)).toBe('VEINTIÚN MIL PESOS M/CTE ($21.000)')
    expect(pesosALetras(31_000_000)).toBe('TREINTA Y UN MILLONES DE PESOS M/CTE ($31.000.000)')
  })

  it('con tilde donde la lleva', () => {
    expect(pesosALetras(1_423_500)).toBe('UN MILLÓN CUATROCIENTOS VEINTITRÉS MIL QUINIENTOS PESOS M/CTE ($1.423.500)')
    expect(numeroALetras(16)).toBe('DIECISÉIS')
    expect(numeroALetras(22)).toBe('VEINTIDÓS')
    expect(numeroALetras(26)).toBe('VEINTISÉIS')
  })

  it('suelto (días, cantidades) «uno» no se apocopa', () => {
    expect(numeroALetras(21)).toBe('VEINTIUNO')
  })
})
