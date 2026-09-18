import { describe, it, expect } from 'vitest'
import { audienciaIncluye, audienciaDe, describirAudiencia, bloquesDetalle } from './avisos'

const empleadoLaboral = { roles: ['Empleado'], vinculo: 'LABORAL' as const, sedeIds: ['pasto'] }
const contratista = { roles: ['Contratista'], vinculo: 'OPS' as const, sedeIds: ['pasto'] }
const admin = { roles: ['Administrador'], vinculo: null, sedeIds: [] }

describe('audiencia de un aviso', () => {
  it('sin restricciones le toca a todos, incluso a quien no tiene ficha', () => {
    expect(audienciaIncluye({}, empleadoLaboral)).toBe(true)
    expect(audienciaIncluye({}, admin)).toBe(true)
  })

  it('por rol: basta con tener uno de los roles', () => {
    expect(audienciaIncluye({ roles: ['Empleado', 'Jefe de área'] }, empleadoLaboral)).toBe(true)
    expect(audienciaIncluye({ roles: ['Recursos Humanos'] }, empleadoLaboral)).toBe(false)
  })

  it('por vínculo: un aviso de dotación no le llega al contratista ni a quien no tiene ficha', () => {
    expect(audienciaIncluye({ vinculos: ['LABORAL'] }, empleadoLaboral)).toBe(true)
    expect(audienciaIncluye({ vinculos: ['LABORAL'] }, contratista)).toBe(false)
    expect(audienciaIncluye({ vinculos: ['LABORAL'] }, admin)).toBe(false)
    expect(audienciaIncluye({ vinculos: ['OPS'] }, contratista)).toBe(true)
  })

  it('por sede, y los ejes se cruzan', () => {
    expect(audienciaIncluye({ sedeIds: ['pasto'] }, empleadoLaboral)).toBe(true)
    expect(audienciaIncluye({ sedeIds: ['popayan'] }, empleadoLaboral)).toBe(false)
    expect(audienciaIncluye({ roles: ['Empleado'], sedeIds: ['popayan'] }, empleadoLaboral)).toBe(false)
  })

  it('tolera JSON sucio de la base', () => {
    expect(audienciaDe(null)).toEqual({ roles: [], vinculos: [], sedeIds: [] })
    expect(audienciaDe({ roles: ['A', 3, ''], vinculos: ['OPS', 'X'] })).toEqual({ roles: ['A'], vinculos: ['OPS'], sedeIds: [] })
  })

  it('se describe en palabras para la lista de gestión', () => {
    expect(describirAudiencia({})).toBe('Todos')
    expect(describirAudiencia({ roles: ['Empleado'], vinculos: ['OPS'], sedeIds: ['s1'] }, { s1: 'Pasto' })).toBe('Empleado · contratistas OPS · Pasto')
  })
})

describe('detalle del aviso', () => {
  it('parte párrafos y viñetas', () => {
    expect(bloquesDetalle('Entra a Mis entregas.\n- Toca Firmar\n- Dibuja tu firma\n\nListo.')).toEqual([
      { tipo: 'parrafo', lineas: ['Entra a Mis entregas.'] },
      { tipo: 'lista', lineas: ['Toca Firmar', 'Dibuja tu firma'] },
      { tipo: 'parrafo', lineas: ['Listo.'] },
    ])
  })
})
