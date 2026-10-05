import { requerirPermiso } from '@/server/sesion'
import { tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
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
    <div>
      {/* El título va en el cliente: el + de "Nuevo rol" abre su diálogo. */}
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
