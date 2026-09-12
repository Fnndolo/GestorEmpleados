import { describe, it, expect } from 'vitest'
import { fechaLimiteComprobante, situacionComprobante } from './comprobante-permiso'
import { parseFechaISO, formatFechaISO } from './fechas'

const d = (iso: string) => parseFechaISO(iso)!
const sinFestivos = new Set<string>()

describe('fechaLimiteComprobante', () => {
  it('cuenta los días hábiles desde el día del permiso', () => {
    // Lunes 14-sep-2026 + 3 hábiles (sábado hábil) → jueves 17
    const limite = fechaLimiteComprobante(d('2026-09-14'), d('2026-09-10'), 3, sinFestivos)
    expect(formatFechaISO(limite)).toBe('2026-09-17')
  })

  it('salta domingos y, si el sábado no es hábil, también sábados', () => {
    // Viernes 18-sep-2026 + 2 hábiles sin sábado → martes 22
    const limite = fechaLimiteComprobante(d('2026-09-18'), d('2026-09-18'), 2, sinFestivos, false)
    expect(formatFechaISO(limite)).toBe('2026-09-22')
  })

  it('salta los festivos', () => {
    // Si el lunes 21 es festivo, el plazo corre al miércoles 23
    const festivos = new Set(['2026-09-21'])
    const limite = fechaLimiteComprobante(d('2026-09-18'), d('2026-09-18'), 2, festivos, false)
    expect(formatFechaISO(limite)).toBe('2026-09-23')
  })

  it('si el permiso ya pasó, el plazo corre desde hoy: no nace vencido', () => {
    const limite = fechaLimiteComprobante(d('2026-09-01'), d('2026-09-10'), 1, sinFestivos)
    expect(formatFechaISO(limite)).toBe('2026-09-11')
  })

  it('con plazo cero vence el mismo día del permiso', () => {
    const limite = fechaLimiteComprobante(d('2026-09-14'), d('2026-09-10'), 0, sinFestivos)
    expect(formatFechaISO(limite)).toBe('2026-09-14')
  })

  it('un plazo negativo o fraccionario se trata como entero no negativo', () => {
    expect(formatFechaISO(fechaLimiteComprobante(d('2026-09-14'), d('2026-09-10'), -5, sinFestivos))).toBe('2026-09-14')
    expect(formatFechaISO(fechaLimiteComprobante(d('2026-09-14'), d('2026-09-10'), 1.9, sinFestivos))).toBe('2026-09-15')
  })
})

describe('situacionComprobante', () => {
  const hoy = d('2026-09-10')

  it('un pendiente con la fecha límite pasada se ve vencido', () => {
    expect(situacionComprobante('PENDIENTE', d('2026-09-09'), hoy)).toBe('VENCIDO')
  })

  it('el día del límite todavía está pendiente, no vencido', () => {
    expect(situacionComprobante('PENDIENTE', d('2026-09-10'), hoy)).toBe('PENDIENTE')
    expect(situacionComprobante('PENDIENTE', d('2026-09-15'), hoy)).toBe('PENDIENTE')
  })

  it('un pendiente sin fecha límite nunca vence', () => {
    expect(situacionComprobante('PENDIENTE', null, hoy)).toBe('PENDIENTE')
  })

  it('entregado, verificado y no requerido se muestran tal cual aunque el plazo haya pasado', () => {
    expect(situacionComprobante('ENTREGADO', d('2026-09-01'), hoy)).toBe('ENTREGADO')
    expect(situacionComprobante('VERIFICADO', d('2026-09-01'), hoy)).toBe('VERIFICADO')
    expect(situacionComprobante('NO_REQUERIDO', d('2026-09-01'), hoy)).toBe('NO_REQUERIDO')
  })
})
