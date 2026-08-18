import { describe, expect, it } from 'vitest'
import { fusionarPermisos } from './tipos'
import type { PermisoEfectivo } from './tipos'

const p = (modulo: string, accion: string, alcance: string) =>
  ({ modulo, accion, alcance }) as PermisoEfectivo

describe('fusionarPermisos', () => {
  it('une los permisos de varios roles', () => {
    const r = fusionarPermisos([
      [p('juridica', 'VER', 'TODAS_SEDES')],
      [p('colaboradores', 'CREAR', 'TODAS_SEDES')],
    ])
    expect(r).toHaveLength(2)
    expect(r.map((x) => x.modulo).sort()).toEqual(['colaboradores', 'juridica'])
  })

  it('no duplica el mismo modulo+accion', () => {
    const r = fusionarPermisos([
      [p('colaboradores', 'VER', 'TODAS_SEDES')],
      [p('colaboradores', 'VER', 'TODAS_SEDES')],
    ])
    expect(r).toHaveLength(1)
  })

  it('conserva el alcance mas amplio sin importar el orden', () => {
    const amplio = p('colaboradores', 'VER', 'TODAS_SEDES')
    const estrecho = p('colaboradores', 'VER', 'EQUIPO')

    // El resultado no puede depender de en qué orden lleguen los roles.
    expect(fusionarPermisos([[estrecho], [amplio]])[0].alcance).toBe('TODAS_SEDES')
    expect(fusionarPermisos([[amplio], [estrecho]])[0].alcance).toBe('TODAS_SEDES')
  })

  it('respeta la jerarquia completa de alcances', () => {
    const orden = ['PROPIO', 'EQUIPO', 'SEDES_ASIGNADAS', 'TODAS_SEDES']
    for (let i = 0; i < orden.length; i++) {
      for (let j = 0; j < orden.length; j++) {
        const r = fusionarPermisos([
          [p('nomina', 'VER', orden[i])],
          [p('nomina', 'VER', orden[j])],
        ])
        expect(r[0].alcance).toBe(orden[Math.max(i, j)])
      }
    }
  })

  it('distingue acciones distintas del mismo modulo', () => {
    const r = fusionarPermisos([
      [p('nomina', 'VER', 'TODAS_SEDES'), p('nomina', 'EDITAR', 'PROPIO')],
    ])
    expect(r).toHaveLength(2)
  })

  it('devuelve lista vacia si no hay roles', () => {
    expect(fusionarPermisos([])).toEqual([])
  })
})
