import { describe, it, expect } from 'vitest'
import { TIPOS_REPORTE, etiquetaReporte, esAcoso } from './linea-etica'

describe('línea ética', () => {
  it('solo los dos de acoso van al Comité de Convivencia', () => {
    expect(TIPOS_REPORTE.filter((t) => t.esAcoso).map((t) => t.valor)).toEqual([
      'ACOSO_LABORAL',
      'ACOSO_SEXUAL',
    ])
  })

  it('una sugerencia o una irregularidad NO son acoso', () => {
    // Es la distinción que evita que una queja del parqueadero le llegue al
    // Comité como un caso de Ley 1010.
    expect(esAcoso('SUGERENCIA')).toBe(false)
    expect(esAcoso('CONDUCTA_IRREGULAR')).toBe(false)
  })

  it('traduce el tipo a lo que se lee en pantalla', () => {
    expect(etiquetaReporte('ACOSO_SEXUAL')).toBe('Acoso sexual')
  })

  it('un tipo desconocido no revienta ni se hace pasar por acoso', () => {
    expect(etiquetaReporte('LO_QUE_SEA')).toBe('LO_QUE_SEA')
    expect(esAcoso('LO_QUE_SEA')).toBe(false)
  })
})
