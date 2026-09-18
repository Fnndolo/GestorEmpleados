import { describe, it, expect } from 'vitest'
import { rutaDisciplinaria } from './ruta-disciplinaria'

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)
const et = (etapa: string, fecha: string) => ({ id: `${etapa}-${fecha}`, etapa, fecha: d(fecha), detalle: null })

describe('rutaDisciplinaria', () => {
  it('en DESCARGOS: la citación está hecha, descargos en curso, el resto pendiente', () => {
    const r = rutaDisciplinaria({
      clase: 'PROCESO', etapa: 'DESCARGOS', cerrado: false,
      etapas: [et('CITACION_DESCARGOS', '2026-08-03')],
    })
    expect(r.map((f) => f.estado)).toEqual(['hecha', 'actual', 'pendiente', 'pendiente', 'pendiente'])
    expect(r[0].fecha).toEqual(d('2026-08-03'))
  })

  it('cerrado: todas las fases hechas y el cierre toma la fecha de la última actuación', () => {
    const r = rutaDisciplinaria({
      clase: 'PROCESO', etapa: 'CERRADO', cerrado: true,
      etapas: [
        et('CITACION_DESCARGOS', '2026-08-03'),
        et('DESCARGOS', '2026-08-06'),
        et('DECISION', '2026-08-11'),
        et('RECURSO', '2026-08-14'),
        et('CERRADO', '2026-08-20'),
      ],
    })
    expect(r.every((f) => f.estado === 'hecha')).toBe(true)
    expect(r.at(-1)?.fecha).toEqual(d('2026-08-20'))
  })

  it('un llamado de atención no tiene decisión ni recurso', () => {
    const r = rutaDisciplinaria({ clase: 'LLAMADO_ATENCION', etapa: 'DESCARGOS', cerrado: false, etapas: [] })
    expect(r.map((f) => f.clave)).toEqual(['CITACION_DESCARGOS', 'DESCARGOS', 'CERRADO'])
  })
})
