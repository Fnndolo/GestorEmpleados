import { describe, it, expect } from 'vitest'
import { resumenOtrosi } from './otrosi'
import { otrosiSchema } from './validaciones/contrato'

describe('resumenOtrosi', () => {
  it('cuenta la duración como un periodo y el salario en pesos', () => {
    const r = resumenOtrosi(['DURACION', 'SALARIO'], { fechaInicio: '2026-10-01', fechaFin: '2026-12-31', salario: 3000000 })
    expect(r.replace(/\u00a0/g, ' ')).toBe('Duración: 01/10/2026 al 31/12/2026 · Salario: $ 3.000.000')
  })

  it('nombra a secas los cambios sin valor y traduce la modalidad', () => {
    const r = resumenOtrosi(['FUNCIONES', 'MODALIDAD_TRABAJO', 'OTRO'], { modalidad: 'REMOTO' })
    expect(r).toBe('Funciones · Modalidad: Remoto · Otro')
  })

  it('no se cae sin valores registrados (otrosíes viejos)', () => {
    expect(resumenOtrosi(['CARGO', 'DURACION'], null)).toBe('Cargo · Duración')
  })
})

describe('otrosiSchema', () => {
  const base = {
    contratoId: '01a03ec8-1057-773d-b4c4-ff81eb84be8a',
    pdfBase64: 'data:application/pdf;base64,JVBERi0=',
    posicionFirma: { pagina: 1, x: 80, y: 150, ancho: 150, alto: 45 },
  }

  it('la duración exige inicio y fin del nuevo periodo', () => {
    const r = otrosiSchema.safeParse({ ...base, tiposCambio: ['DURACION'], fechaFinNueva: '2026-12-31' })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0].message).toMatch(/inicio y la de fin/)
  })

  it('la fecha de fin no puede ser anterior a la de inicio', () => {
    const r = otrosiSchema.safeParse({ ...base, tiposCambio: ['DURACION'], fechaInicioNueva: '2026-12-31', fechaFinNueva: '2026-10-01' })
    expect(r.success).toBe(false)
  })

  it('acepta un periodo bien formado y no pide descripción ni fecha', () => {
    const r = otrosiSchema.safeParse({ ...base, tiposCambio: ['DURACION'], fechaInicioNueva: '2026-10-01', fechaFinNueva: '2026-12-31' })
    expect(r.success).toBe(true)
  })

  it('sin PDF no hay otrosí', () => {
    const r = otrosiSchema.safeParse({ ...base, pdfBase64: '', tiposCambio: ['OTRO'] })
    expect(r.success).toBe(false)
  })
})
