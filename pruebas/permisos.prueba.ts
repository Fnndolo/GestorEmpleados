import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '@/lib/db'
import { tienePermiso, alcanceDe, type UsuarioSesion } from '@/lib/permisos/tipos'
import { whereColaboradores } from '@/server/consultas/colaboradores'

/**
 * Quién puede hacer qué, con los permisos REALES que quedaron en la base tras
 * sembrar los roles — no con una tabla inventada en la prueba.
 *
 * Es la parte del sistema donde un error no se ve: nadie nota que un rol tiene
 * un permiso de más hasta que alguien abre algo que no debía. Por eso se afirma
 * tanto lo que cada rol PUEDE como lo que NO.
 */

const ROLES = [
  'Administrador', 'Recursos Humanos', 'Contador', 'Responsable SST',
  'Jurídica', 'Jefe de área', 'Empleado', 'Nómina', 'Subgerencia',
] as const

const usuarios = new Map<string, UsuarioSesion>()

/** Arma una sesión con los permisos que el rol tiene de verdad en la base. */
async function sesionDe(rolNombre: string): Promise<UsuarioSesion> {
  const rol = await prisma.rol.findUniqueOrThrow({
    where: { nombre: rolNombre },
    include: { permisos: true },
  })
  return {
    id: `prueba-${rol.id}`, email: `${rolNombre}@prueba.local`, nombre: rolNombre,
    rolId: rol.id, rolNombre, rolNombres: [rolNombre],
    estado: 'ACTIVO', debeCambiarPassword: false, colaboradorId: null,
    sedeIds: [],
    permisos: rol.permisos.map((p) => ({
      modulo: p.modulo as never, accion: p.accion as never, alcance: p.alcance as never,
    })),
  }
}

beforeAll(async () => {
  for (const r of ROLES) usuarios.set(r, await sesionDe(r))
})

afterAll(async () => { await prisma.$disconnect() })

describe('cada rol ve lo suyo', () => {
  it('el Administrador puede todo', () => {
    const u = usuarios.get('Administrador')!
    expect(tienePermiso(u, 'colaboradores', 'EDITAR')).toBe(true)
    expect(tienePermiso(u, 'nomina', 'APROBAR')).toBe(true)
    expect(tienePermiso(u, 'configuracion', 'EDITAR')).toBe(true)
  })

  it('el Empleado NO llega a los datos de los demás', () => {
    const u = usuarios.get('Empleado')!
    // Su autoservicio sí; el módulo de colaboradores no se edita desde ahí.
    expect(tienePermiso(u, 'autoservicio', 'CREAR')).toBe(true)
    expect(tienePermiso(u, 'colaboradores', 'EDITAR')).toBe(false)
    expect(tienePermiso(u, 'nomina', 'VER')).toBe(false)
    expect(tienePermiso(u, 'configuracion', 'EDITAR')).toBe(false)
  })

  it('el Contador ve nómina pero no manda en Jurídica', () => {
    const u = usuarios.get('Contador')!
    expect(tienePermiso(u, 'nomina', 'VER')).toBe(true)
    expect(tienePermiso(u, 'juridica', 'EDITAR')).toBe(false)
  })

  it('el Responsable SST manda en SST y no en nómina', () => {
    const u = usuarios.get('Responsable SST')!
    expect(tienePermiso(u, 'sst', 'CREAR')).toBe(true)
    expect(tienePermiso(u, 'nomina', 'CREAR')).toBe(false)
  })

  it('Jurídica lleva los disciplinarios y no toca la nómina', () => {
    const u = usuarios.get('Jurídica')!
    expect(tienePermiso(u, 'juridica', 'CREAR')).toBe(true)
    expect(tienePermiso(u, 'nomina', 'EDITAR')).toBe(false)
  })

  it('nadie fuera de Configuración puede cambiar parámetros de nómina', () => {
    // Los parámetros legales mueven TODO el cálculo: es el permiso más sensible.
    for (const r of ['Empleado', 'Contador', 'Jefe de área', 'Responsable SST'] as const) {
      expect(tienePermiso(usuarios.get(r)!, 'configuracion', 'EDITAR')).toBe(false)
    }
  })
})

describe('alcance de datos', () => {
  it('el Jefe de área alcanza a su equipo, no a toda la empresa', () => {
    const u = usuarios.get('Jefe de área')!
    const alcance = alcanceDe(u, 'colaboradores', 'VER')
    expect(alcance).not.toBe('TODAS_SEDES')
  })

  it('el filtro de un empleado se cierra sobre él mismo', async () => {
    const colab = await prisma.colaborador.findFirstOrThrow({ where: { estado: 'ACTIVO' } })
    const u = { ...usuarios.get('Empleado')!, colaboradorId: colab.id }
    const where = await whereColaboradores(u, {}, { ignorarSedeActiva: true })
    // Con alcance PROPIO el where tiene que quedar amarrado a su propio id: si
    // saliera vacío, el empleado vería la nómina y los datos de todos.
    expect(JSON.stringify(where)).toContain(colab.id)
  })

  it('el Administrador no queda limitado por alcance', async () => {
    const u = usuarios.get('Administrador')!
    const where = await whereColaboradores(u, {}, { ignorarSedeActiva: true })
    const total = await prisma.colaborador.count()
    const visibles = await prisma.colaborador.count({ where })
    expect(visibles).toBe(total)
  })
})
