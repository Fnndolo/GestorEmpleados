import { describe, it, expect } from 'vitest'
import {
  fechaFinTrasAnularProrroga, sigueSuspendido, esVariacionMasReciente, numeroOtrosiDeMotivo, menorFecha, mayorFechaOAbierta,
} from './contratos-modificaciones'

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

describe('fechaFinTrasAnularProrroga', () => {
  it('vuelve al fin de la prórroga anterior cuando la hay', () => {
    expect(fechaFinTrasAnularProrroga({ fechaInicio: d('2026-07-01') }, { fechaFin: d('2026-06-30') })).toEqual(d('2026-06-30'))
  })
  it('sin prórroga anterior, el contrato terminaba el día antes del inicio de la anulada', () => {
    expect(fechaFinTrasAnularProrroga({ fechaInicio: d('2026-07-01') }, null)).toEqual(d('2026-06-30'))
    expect(fechaFinTrasAnularProrroga({ fechaInicio: d('2026-01-01') }, null)).toEqual(d('2025-12-31'))
  })
})

describe('sigueSuspendido', () => {
  const hoy = d('2026-10-24')
  it('sin suspensiones, no', () => expect(sigueSuspendido([], hoy)).toBe(false))
  it('una sin fecha de fin lo deja suspendido', () => expect(sigueSuspendido([{ fechaFin: null }], hoy)).toBe(true))
  it('una que ya terminó no cuenta', () => expect(sigueSuspendido([{ fechaFin: d('2026-10-23') }], hoy)).toBe(false))
  it('una que termina hoy o después sí cuenta', () => {
    expect(sigueSuspendido([{ fechaFin: d('2026-10-24') }], hoy)).toBe(true)
    expect(sigueSuspendido([{ fechaFin: d('2026-12-01') }], hoy)).toBe(true)
  })
})

describe('esVariacionMasReciente', () => {
  const vs = [
    { id: 'a', fechaVigencia: d('2026-01-01'), creadoEn: d('2026-01-01') },
    { id: 'b', fechaVigencia: d('2026-06-01'), creadoEn: d('2026-05-20') },
    { id: 'c', fechaVigencia: d('2026-06-01'), creadoEn: d('2026-05-25') },
  ]
  it('gana la de vigencia más reciente y, a igual fecha, la registrada después', () => {
    expect(esVariacionMasReciente('c', vs)).toBe(true)
    expect(esVariacionMasReciente('b', vs)).toBe(false)
    expect(esVariacionMasReciente('a', vs)).toBe(false)
  })
  it('sin variaciones, ninguna es la vigente', () => expect(esVariacionMasReciente('a', [])).toBe(false))
})

describe('numeroOtrosiDeMotivo', () => {
  it('reconoce el motivo que deja agregarOtrosi', () => {
    expect(numeroOtrosiDeMotivo('Otrosí 3')).toBe(3)
    expect(numeroOtrosiDeMotivo('Aumento anual')).toBeNull()
    expect(numeroOtrosiDeMotivo(null)).toBeNull()
  })
})

describe('rangos', () => {
  it('menorFecha y mayorFechaOAbierta', () => {
    expect(menorFecha(d('2026-01-02'), d('2026-01-01'))).toEqual(d('2026-01-01'))
    expect(mayorFechaOAbierta(d('2026-01-02'), d('2026-01-01'))).toEqual(d('2026-01-02'))
    expect(mayorFechaOAbierta(null, d('2026-01-01'))).toBeNull()
  })
})
