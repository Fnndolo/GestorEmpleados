import { describe, expect, it } from 'vitest'
import { horasSemana, jornadaMaximaSemanal, mismosDias, resumenHorario, textoHoras, validarDias, type DiasHorario } from './horarios'

const franja = (entrada: string, salida: string, almuerzo?: [string, string]) =>
  almuerzo ? { entrada, salida, almuerzo_min: 0, almuerzo_desde: almuerzo[0], almuerzo_hasta: almuerzo[1] } : { entrada, salida, almuerzo_min: 0 }

describe('validarDias', () => {
  it('el almuerzo sale del rango, como en AsistencIA', () => {
    const r = validarDias({ '1': franja('08:00', '18:00', ['13:00', '14:00']) })
    expect('dias' in r && r.dias['1']?.almuerzo_min).toBe(60)
  })

  it('rechaza horas inválidas, almuerzo fuera de la jornada o incompleto, y un horario sin días', () => {
    expect(validarDias({ '1': franja('8:00', '18:00') })).toHaveProperty('error')
    expect(validarDias({ '1': franja('08:00', '12:00', ['13:00', '14:00']) })).toHaveProperty('error')
    expect(validarDias({ '1': { entrada: '08:00', salida: '18:00', almuerzo_min: 0, almuerzo_desde: '13:00' } })).toHaveProperty('error')
    expect(validarDias({})).toHaveProperty('error')
    expect(validarDias({ '7': franja('08:00', '18:00') })).toHaveProperty('error')
  })

  it('un día en nulo es descanso y no cuenta', () => {
    const r = validarDias({ '1': franja('08:00', '12:00'), '0': null })
    expect('dias' in r && Object.keys(r.dias)).toEqual(['1'])
  })

  it('acepta un turno nocturno que termina al día siguiente', () => {
    const r = validarDias({ '5': franja('22:00', '06:00', ['02:00', '02:30']) })
    expect('dias' in r && r.dias['5']?.almuerzo_min).toBe(30)
  })
})

describe('horas y resumen', () => {
  const tienda: DiasHorario = {
    '1': franja('08:00', '18:00', ['13:00', '14:00']), '2': franja('08:00', '18:00', ['13:00', '14:00']),
    '3': franja('08:00', '18:00', ['13:00', '14:00']), '4': franja('08:00', '18:00', ['13:00', '14:00']),
    '5': franja('08:00', '18:00', ['13:00', '14:00']), '6': franja('08:00', '13:00'),
  }
  // Los almuerzos se calculan al validar; aquí se ponen a mano.
  for (const d of ['1', '2', '3', '4', '5'] as const) tienda[d]!.almuerzo_min = 60

  it('suma la semana sin los almuerzos', () => {
    expect(horasSemana(tienda)).toBe(50)
    expect(textoHoras(44.5)).toBe('44 h 30 min')
  })

  it('junta los días seguidos con la misma franja', () => {
    expect(resumenHorario(tienda)).toBe('Lun–Vie 08:00–18:00 · Sáb 08:00–13:00')
    expect(resumenHorario({ '1': franja('08:00', '12:00'), '3': franja('08:00', '12:00') })).toBe('Lun 08:00–12:00 · Mié 08:00–12:00')
    expect(resumenHorario({})).toBe('Sin días de trabajo')
  })

  it('compara horarios sin importar el orden de las llaves', () => {
    expect(mismosDias({ '1': franja('08:00', '12:00'), '2': franja('08:00', '12:00') }, { '2': franja('08:00', '12:00'), '1': franja('08:00', '12:00') })).toBe(true)
    expect(mismosDias({ '1': franja('08:00', '12:00') }, { '1': franja('08:00', '13:00') })).toBe(false)
  })
})

describe('jornada máxima (Ley 2101 de 2021)', () => {
  it('baja cada 15 de julio', () => {
    expect(jornadaMaximaSemanal(new Date('2025-07-14T00:00:00Z'))).toBe(46)
    expect(jornadaMaximaSemanal(new Date('2025-07-15T00:00:00Z'))).toBe(44)
    expect(jornadaMaximaSemanal(new Date('2026-10-03T00:00:00Z'))).toBe(42)
  })
})
