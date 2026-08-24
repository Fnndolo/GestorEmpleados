import { describe, it, expect } from 'vitest'
import { CLAVES_MOTOR, esClaveDelMotor } from './claves-motor'

describe('esClaveDelMotor', () => {
  it('protege las claves que el motor lee', () => {
    for (const clave of CLAVES_MOTOR) expect(esClaveDelMotor(clave)).toBe(true)
  })

  it('protege las cinco clases de riesgo ARL', () => {
    for (const c of ['I', 'II', 'III', 'IV', 'V']) expect(esClaveDelMotor(`ARL_${c}`)).toBe(true)
  })

  it('deja libre una clave que agregue la empresa', () => {
    expect(esClaveDelMotor('BONO_NAVIDAD')).toBe(false)
    expect(esClaveDelMotor('TOPE_INTERNO_VIATICOS')).toBe(false)
  })

  it('no se deja engañar por espacios ni minúsculas', () => {
    // La clave llega de un formulario; se normaliza igual que al guardarla.
    expect(esClaveDelMotor(' smmlv ')).toBe(true)
    expect(esClaveDelMotor('Uvt')).toBe(true)
  })
})
