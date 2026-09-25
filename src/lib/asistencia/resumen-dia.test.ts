import { describe, it, expect } from 'vitest'
import { textoResumenDia, textoJornadaDia } from './resumen-dia'

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

describe('textoJornadaDia', () => {
  it('titula con el día en letras y lista entradas, salidas y lo trabajado, nada más', () => {
    const r = textoJornadaDia('2026-09-24', {
      trabajado: { segundos: 36780 },
      marcaciones: [{ tipo: 'entrada', texto: '08:02 a. m.' }, { tipo: 'salida', texto: '09:15 p. m.' }],
    })
    expect(r.titulo).toBe('Tu jornada del jueves 24 de septiembre')
    expect(r.mensaje).toBe('Entrada 08:02 a. m. · Salida 09:15 p. m. · Trabajaste 10 h 13 min')
  })

  it('lista todos los registros cuando hay varios', () => {
    const r = textoJornadaDia('2026-09-24', {
      trabajado: { segundos: 1800 },
      marcaciones: [
        { tipo: 'entrada', texto: '08:00 a. m.' }, { tipo: 'salida', texto: '12:00 p. m.' },
        { tipo: 'entrada', texto: '02:00 p. m.' }, { tipo: 'salida', texto: '02:30 p. m.' },
      ],
    })
    expect(r.mensaje).toBe('Entrada 08:00 a. m. · Salida 12:00 p. m. · Entrada 02:00 p. m. · Salida 02:30 p. m. · Trabajaste 30 min')
  })
})
