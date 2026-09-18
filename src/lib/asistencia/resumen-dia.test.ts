import { describe, it, expect } from 'vitest'
import { textoResumenDia } from './resumen-dia'

describe('textoResumenDia', () => {
  it('sin tramos lo dice claro, con la fecha en letras', () => {
    const r = textoResumenDia('2026-09-18', [])
    expect(r.titulo).toBe('Tu registro de hoy en AsistencIA')
    expect(r.mensaje).toBe('Hoy, 18 de septiembre de 2026, no tienes horas extra ni recargos registrados en AsistencIA.')
  })

  it('lista los tramos en orden de hora, con su tipo en palabras y el total', () => {
    const r = textoResumenDia('2026-09-18', [
      { horaInicio: '20:00', horaFin: '22:00', tipoHora: 'HEN', horas: 2 },
      { horaInicio: '17:30', horaFin: '20:00', tipoHora: 'HED', horas: 2.5 },
    ])
    expect(r.mensaje).toBe('Hoy, 18 de septiembre de 2026: 17:30–20:00 extra diurna (2,5 h) · 20:00–22:00 extra nocturna (2 h). Total: 4,5 h.')
  })

  it('un tipo desconocido sale con su código, sin romper nada', () => {
    const r = textoResumenDia('2026-09-20', [{ horaInicio: '08:00', horaFin: '09:00', tipoHora: 'RN', horas: 1 }])
    expect(r.mensaje).toContain('08:00–09:00 RN (1 h)')
  })
})
