import { requerirPermiso } from '@/server/sesion'
import { tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { MODULOS } from '@/lib/permisos/modulos'
import { RolesCliente } from './roles-cliente'

export const metadata = { title: 'Roles y permisos · Configuración' }

export default async function RolesPage() {
  const sesion = await requerirPermiso('usuarios', 'VER')
  const puedeEditar = tienePermiso(sesion, 'usuarios', 'EDITAR')

  const roles = await prisma.rol.findMany({
    include: { permisos: true, _count: { select: { usuarios: true } } },
    orderBy: [{ esSistema: 'desc' }, { nombre: 'asc' }],
  })

  return (
    <div className="mx-auto max-w-5xl">
      <Encabezado
        titulo="Roles y permisos"
        descripcion="Define qué módulos puede ver y editar cada rol, y con qué alcance de datos."
      />
      <RolesCliente
        roles={roles.map((r) => ({
          id: r.id,
          nombre: r.nombre,
          descripcion: r.descripcion,
          esSistema: r.esSistema,
          usuarios: r._count.usuarios,
          permisos: r.permisos.map((p) => ({ modulo: p.modulo, accion: p.accion, alcance: p.alcance })),
        }))}
        modulos={Object.entries(MODULOS).map(([clave, etiqueta]) => ({ clave, etiqueta }))}
        puedeEditar={puedeEditar}
      />
    </div>
  )
}
