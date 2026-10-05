import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { AreasCliente } from './areas-cliente'

export const metadata = { title: 'Áreas · Configuración' }

export default async function AreasPage() {
  const usuario = await requerirPermiso('configuracion', 'VER')
  const puedeCrear = tienePermiso(usuario, 'configuracion', 'CREAR')
  const puedeEditar = tienePermiso(usuario, 'configuracion', 'EDITAR')
  const puedeEliminar = tienePermiso(usuario, 'configuracion', 'ELIMINAR')

  const [areas, colaboradores] = await Promise.all([
    prisma.area.findMany({
      orderBy: { nombre: 'asc' },
      include: {
        padre: { select: { nombre: true } },
        responsable: { select: { nombres: true, apellidos: true } },
        _count: { select: { cargos: true, colaboradores: true, hijas: true } },
      },
    }),
    prisma.colaborador.findMany({
      where: { estado: 'ACTIVO' },
      select: { id: true, nombres: true, apellidos: true },
      orderBy: [{ apellidos: 'asc' }],
      take: 500,
    }),
  ])

  return (
    <div>
      {/* El título va en el cliente: el + de "Nueva área" abre su diálogo. */}
      <AreasCliente
        puedeCrear={puedeCrear}
        puedeEditar={puedeEditar}
        puedeEliminar={puedeEliminar}
        areas={areas.map((a) => ({
          id: a.id,
          nombre: a.nombre,
          padreId: a.padreId ?? '',
          padreNombre: a.padre?.nombre ?? '',
          responsableId: a.responsableId ?? '',
          responsableNombre: a.responsable ? `${a.responsable.nombres} ${a.responsable.apellidos}` : '',
          activa: a.activa,
          cargos: a._count.cargos,
          colaboradores: a._count.colaboradores,
          hijas: a._count.hijas,
        }))}
        colaboradores={colaboradores.map((c) => ({ id: c.id, nombre: `${c.nombres} ${c.apellidos}` }))}
      />
    </div>
  )
}
