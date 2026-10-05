import { requerirPermiso } from '@/server/sesion'
import { tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { SedesCliente } from './sedes-cliente'

export const metadata = { title: 'Sedes y ciudades · Configuración' }

export default async function SedesPage() {
  const usuario = await requerirPermiso('configuracion', 'VER')
  const puedeEditar = tienePermiso(usuario, 'configuracion', 'EDITAR')
  const puedeCrear = tienePermiso(usuario, 'configuracion', 'CREAR')

  const [sedes, ciudades] = await Promise.all([
    prisma.sede.findMany({
      include: { ciudad: true },
      orderBy: [{ esPrincipal: 'desc' }, { nombre: 'asc' }],
    }),
    prisma.ciudad.findMany({
      orderBy: { nombre: 'asc' },
      include: { _count: { select: { sedes: true, colaboradores: true } } },
    }),
  ])

  return (
    <div>
      <SedesCliente
        sedes={sedes.map((s) => ({
          id: s.id,
          nombre: s.nombre,
          ciudadId: s.ciudadId,
          ciudadNombre: s.ciudad.nombre,
          direccion: s.direccion,
          telefono: s.telefono,
          esPrincipal: s.esPrincipal,
          activa: s.activa,
        }))}
        ciudades={ciudades.map((c) => ({
          id: c.id,
          nombre: c.nombre,
          departamento: c.departamento,
          codigoDane: c.codigoDane ?? '',
          enUso: c._count.sedes + c._count.colaboradores,
        }))}
        puedeCrear={puedeCrear}
        puedeEditar={puedeEditar}
        puedeEliminar={tienePermiso(usuario, 'configuracion', 'ELIMINAR')}
      />
    </div>
  )
}
