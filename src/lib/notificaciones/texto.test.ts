import { describe, it, expect } from 'vitest'
import { nombreCorto, fechaBreve, rangoBreve, dias } from './texto'

const ANIO = new Date().getUTCFullYear()

describe('nombreCorto', () => {
  it('deja todos los nombres y solo el primer apellido', () => {
    expect(nombreCorto('Yeison', 'Córdoba Palacios')).toBe('Yeison Córdoba')
    expect(nombreCorto('María José', 'Pérez Gómez')).toBe('María José Pérez')
  })
  it('no se cae sin datos', () => {
    expect(nombreCorto(null, undefined)).toBe('Un colaborador')
    expect(nombreCorto('Ana', '')).toBe('Ana')
  })
})

describe('fechaBreve', () => {
  it('pone día y mes, y el año solo si no es el actual', () => {
    expect(fechaBreve(`${ANIO}-09-22`)).toBe('22 sep')
    expect(fechaBreve('2024-01-05')).toBe('5 ene 2024')
    expect(fechaBreve(new Date(Date.UTC(ANIO, 11, 31)))).toBe('31 dic')
  })
  it('devuelve vacío sin fecha y no rompe con textos raros', () => {
    expect(fechaBreve(null)).toBe('')
    expect(fechaBreve('mañana')).toBe('mañana')
  })
})

describe('rangoBreve', () => {
  it('comprime el rango según compartan mes o no', () => {
    expect(rangoBreve(`${ANIO}-10-05`, `${ANIO}-10-05`)).toBe('5 oct')
    expect(rangoBreve(`${ANIO}-10-05`, `${ANIO}-10-09`)).toBe('5–9 oct')
    expect(rangoBreve(`${ANIO}-09-28`, `${ANIO}-10-02`)).toBe('28 sep–2 oct')
  })
  it('con un solo extremo muestra ese', () => {
    expect(rangoBreve(`${ANIO}-10-05`, null)).toBe('5 oct')
    expect(rangoBreve(null, `${ANIO}-10-05`)).toBe('5 oct')
  })
})

describe('dias', () => {
  it('concuerda en singular y plural, con o sin hábiles', () => {
    expect(dias(1)).toBe('1 día')
    expect(dias(3)).toBe('3 días')
    expect(dias(1, true)).toBe('1 día hábil')
    expect(dias(5, true)).toBe('5 días hábiles')
  })
})
