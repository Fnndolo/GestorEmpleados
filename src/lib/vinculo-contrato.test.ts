import { describe, it, expect } from 'vitest'
import {
  vinculoDeContrato, vinculoCoincide, discrepanciaVinculo, CONTRATOS_DE_NOMINA,
  type TipoContratoLaboral, type TipoVinculo,
} from './vinculo-contrato'

const TIPOS_CONTRATO: TipoContratoLaboral[] = [
  'TERMINO_FIJO', 'TERMINO_INDEFINIDO', 'OBRA_LABOR', 'APRENDIZAJE_SENA', 'PRACTICA',
]

describe('vinculoDeContrato', () => {
  it('traduce los nombres que difieren entre los dos enums', () => {
    // Estos dos son los que no se pueden comparar por igualdad de texto.
    expect(vinculoDeContrato('APRENDIZAJE_SENA')).toBe('APRENDIZ_SENA')
    expect(vinculoDeContrato('PRACTICA')).toBe('PRACTICANTE')
  })

  it('cubre todos los tipos de contrato', () => {
    for (const t of TIPOS_CONTRATO) expect(vinculoDeContrato(t)).toBeTruthy()
  })
})

describe('vinculoCoincide', () => {
  it('acepta cada contrato con su vínculo correspondiente', () => {
    for (const t of TIPOS_CONTRATO) {
      expect(vinculoCoincide(t, vinculoDeContrato(t))).toBe(true)
    }
  })

  it('rechaza el caso real que se encontró: contrato de obra con ficha de fijo', () => {
    expect(vinculoCoincide('OBRA_LABOR', 'TERMINO_FIJO')).toBe(false)
  })

  it('rechaza un contrato laboral sobre una ficha de prestación de servicios', () => {
    // OPS tiene su propio modelo de contrato: si la ficha dice OPS y hay un
    // contrato laboral, uno de los dos está mal.
    for (const t of TIPOS_CONTRATO) expect(vinculoCoincide(t, 'OPS')).toBe(false)
  })
})

describe('discrepanciaVinculo', () => {
  it('no dice nada cuando coinciden', () => {
    expect(discrepanciaVinculo('TERMINO_FIJO', 'TERMINO_FIJO')).toBeNull()
  })

  it('nombra en español los dos tipos en conflicto', () => {
    const msg = discrepanciaVinculo('OBRA_LABOR', 'TERMINO_FIJO')
    expect(msg).toContain('obra o labor')
    expect(msg).toContain('término fijo')
  })

  it('produce mensaje para toda combinación que no coincide', () => {
    const vinculos: TipoVinculo[] = [
      'TERMINO_INDEFINIDO', 'TERMINO_FIJO', 'OBRA_LABOR', 'APRENDIZ_SENA', 'OPS', 'PRACTICANTE',
    ]
    for (const t of TIPOS_CONTRATO) {
      for (const v of vinculos) {
        const msg = discrepanciaVinculo(t, v)
        if (vinculoCoincide(t, v)) expect(msg).toBeNull()
        else expect(msg).toBeTruthy()
      }
    }
  })
})

describe('CONTRATOS_DE_NOMINA', () => {
  it('incluye el aprendizaje SENA', () => {
    // Estuvo fuera de la lista del liquidador y el efecto era que un aprendiz no
    // aparecía en ninguna nómina: no se le pagaba nada. En esta empresa el
    // aprendiz es laboral desde el primer día.
    expect(CONTRATOS_DE_NOMINA).toContain('APRENDIZAJE_SENA')
  })

  it('incluye los tres tipos laborales corrientes', () => {
    for (const t of ['TERMINO_FIJO', 'TERMINO_INDEFINIDO', 'OBRA_LABOR']) {
      expect(CONTRATOS_DE_NOMINA).toContain(t)
    }
  })

  it('deja por fuera la práctica, que no genera salario', () => {
    expect(CONTRATOS_DE_NOMINA).not.toContain('PRACTICA')
  })

  it('todo tipo de nómina tiene su vínculo equivalente en la ficha', () => {
    for (const t of CONTRATOS_DE_NOMINA) expect(vinculoDeContrato(t)).toBeTruthy()
  })
})
