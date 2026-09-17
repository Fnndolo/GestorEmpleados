import { describe, it, expect } from 'vitest'
import { EVENTOS_NOTIF, CORREO_POR_DEFECTO, mandaCorreo } from './catalogo'

describe('CORREO_POR_DEFECTO', () => {
  it('ningún evento manda correo mientras nadie lo encienda en Ajustes', () => {
    // Las cuentas comparten buzón: el correo de los eventos se enciende a mano,
    // uno por uno, y solo si de verdad hace falta.
    expect([...CORREO_POR_DEFECTO]).toEqual([])
  })

  it('deja sin correo las confirmaciones de lo que la persona acaba de hacer', () => {
    // 'expediente_pendiente' sale junto al correo del contrato: no debe competir con él.
    for (const clave of ['contrato_firmado', 'dotacion_firmada', 'ficha_actualizada', 'solicitud_creada', 'expediente_pendiente']) {
      expect(CORREO_POR_DEFECTO.has(clave)).toBe(false)
    }
  })
})

describe('mandaCorreo', () => {
  it('sin preferencia guardada, usa el valor por defecto del catálogo (apagado)', () => {
    expect(mandaCorreo('disciplinario_citacion', {})).toBe(false)
    expect(mandaCorreo('contrato_firmado', {})).toBe(false)
  })

  it('la preferencia guardada manda sobre el valor por defecto', () => {
    expect(mandaCorreo('disciplinario_citacion', { disciplinario_citacion: true })).toBe(true)
    expect(mandaCorreo('contrato_firmado', { contrato_firmado: false })).toBe(false)
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
