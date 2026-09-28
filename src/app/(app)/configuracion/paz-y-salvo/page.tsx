import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { AreasPazYSalvoCliente } from './areas-cliente'

export const metadata = { title: 'Paz y salvo · Configuración' }

export default async function PazYSalvoConfigPage() {
  const usuario = await requerirPermiso('configuracion', 'VER')
  const [areas, usuarios] = await Promise.all([
    prisma.areaPazYSalvo.findMany({
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
      include: { responsable: { select: { name: true } } },
    }),
    prisma.user.findMany({ where: { estado: 'ACTIVO' }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' } }),
  ])

  return (
    <div>
      <Encabezado enLinea titulo="Paz y salvo" />
      <AreasPazYSalvoCliente
        puedeCrear={tienePermiso(usuario, 'configuracion', 'CREAR')}
        puedeEditar={tienePermiso(usuario, 'configuracion', 'EDITAR')}
        puedeEliminar={tienePermiso(usuario, 'configuracion', 'ELIMINAR')}
        areas={areas.map((a) => ({
          id: a.id, nombre: a.nombre, concepto: a.concepto, chequeo: a.chequeo as 'ACTIVOS' | 'PRESTAMOS' | null,
          responsableId: a.responsableId, responsableNombre: a.responsable?.name ?? null, activa: a.activa,
        }))}
        usuarios={usuarios.map((u) => ({ id: u.id, nombre: u.name, email: u.email }))}
      />
    </div>
  )
}
