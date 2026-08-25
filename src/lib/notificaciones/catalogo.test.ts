import { describe, it, expect } from 'vitest'
import { EVENTOS_NOTIF, CORREO_POR_DEFECTO, mandaCorreo } from './catalogo'

describe('CORREO_POR_DEFECTO', () => {
  it('solo manda correo donde corre un plazo o hay que actuar fuera de la app', () => {
    expect([...CORREO_POR_DEFECTO].sort()).toEqual([
      'contrato_pendiente_firma',
      'contrato_por_firmar',
      'denuncia_acoso',
      'disciplinario_citacion',
      'disciplinario_decision',
      'habeas_data',
    ])
  })

  it('deja sin correo las confirmaciones de lo que la persona acaba de hacer', () => {
    for (const clave of ['contrato_firmado', 'dotacion_firmada', 'ficha_actualizada', 'solicitud_creada']) {
      expect(CORREO_POR_DEFECTO.has(clave)).toBe(false)
    }
  })
})

describe('mandaCorreo', () => {
  it('sin preferencia guardada, usa el valor por defecto del catálogo', () => {
    expect(mandaCorreo('disciplinario_citacion', {})).toBe(true)
    expect(mandaCorreo('contrato_firmado', {})).toBe(false)
  })

  it('la preferencia guardada manda sobre el valor por defecto, en los dos sentidos', () => {
    expect(mandaCorreo('disciplinario_citacion', { disciplinario_citacion: false })).toBe(false)
    expect(mandaCorreo('contrato_firmado', { contrato_firmado: true })).toBe(true)
  })

  it('un aviso sin evento o sin catalogar no manda correo', () => {
    // El correo tiene que ser una decisión explícita: lo que no está en el
    // catálogo no puede colarse a la bandeja de nadie.
    expect(mandaCorreo(undefined, {})).toBe(false)
    expect(mandaCorreo('evento_inventado', {})).toBe(false)
  })

  it('no hay claves repetidas en el catálogo', () => {
    const claves = EVENTOS_NOTIF.map((e) => e.clave)
    expect(new Set(claves).size).toBe(claves.length)
  })
})
