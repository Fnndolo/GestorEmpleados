import 'server-only'
import { prisma } from '@/lib/db'

export type CatalogosColaborador = Awaited<ReturnType<typeof cargarCatalogos>>

export async function cargarCatalogos() {
  const [sedes, areas, cargos, ciudades, entidades, bancos, jefes] = await Promise.all([
    prisma.sede.findMany({ where: { activa: true }, include: { ciudad: true }, orderBy: { nombre: 'asc' } }),
    prisma.area.findMany({ where: { activa: true }, orderBy: { nombre: 'asc' } }),
    prisma.cargo.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }),
    prisma.ciudad.findMany({ orderBy: { nombre: 'asc' } }),
    prisma.entidadSeguridadSocial.findMany({ where: { activa: true }, orderBy: { nombre: 'asc' } }),
    prisma.banco.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }),
    // Candidatos a jefe inmediato: activos que NO sean administradores de la plataforma
    // (p. ej. la coordinadora de Talento Humano es administradora y no debe figurar como jefe).
    prisma.colaborador.findMany({
      where: { estado: 'ACTIVO', NOT: { usuario: { rol: { nombre: 'Administrador' } } } },
      select: { id: true, nombres: true, apellidos: true },
      orderBy: [{ apellidos: 'asc' }],
      take: 500,
    }),
  ])

  return {
    sedes: sedes.map((s) => ({ id: s.id, nombre: s.nombre, ciudad: s.ciudad.nombre })),
    areas: areas.map((a) => ({ id: a.id, nombre: a.nombre })),
    cargos: cargos.map((c) => ({ id: c.id, nombre: c.nombre, areaId: c.areaId })),
    ciudades: ciudades.map((c) => ({ id: c.id, nombre: c.nombre, departamento: c.departamento })),
    eps: entidades.filter((e) => e.tipo === 'EPS').map((e) => ({ id: e.id, nombre: e.nombre })),
    afp: entidades.filter((e) => e.tipo === 'AFP').map((e) => ({ id: e.id, nombre: e.nombre })),
    fondosCesantias: entidades.filter((e) => e.tipo === 'FONDO_CESANTIAS').map((e) => ({ id: e.id, nombre: e.nombre })),
    cajas: entidades.filter((e) => e.tipo === 'CAJA_COMPENSACION').map((e) => ({ id: e.id, nombre: e.nombre })),
    arl: entidades.filter((e) => e.tipo === 'ARL').map((e) => ({ id: e.id, nombre: e.nombre })),
    bancos: bancos.map((b) => ({ id: b.id, nombre: b.nombre })),
    jefes: jefes.map((j) => ({ id: j.id, nombre: `${j.nombres} ${j.apellidos}` })),
  }
}
