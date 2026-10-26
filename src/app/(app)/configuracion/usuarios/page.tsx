import { requerirPermiso } from '@/server/sesion'
import { tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { UsuariosCliente } from './usuarios-cliente'
import { urlFoto } from '@/lib/foto'

export const metadata = { title: 'Usuarios · Configuración' }

export default async function UsuariosPage() {
  const sesion = await requerirPermiso('usuarios', 'VER')
  const puedeCrear = tienePermiso(sesion, 'usuarios', 'CREAR')
  const puedeEditar = tienePermiso(sesion, 'usuarios', 'EDITAR')
  const puedeEliminar = tienePermiso(sesion, 'usuarios', 'ELIMINAR')

  const [usuarios, roles, sedes, actividad] = await Promise.all([
    prisma.user.findMany({
      include: {
        rol: true,
        colaborador: { select: { id: true, fotoPath: true } },
        rolesExtra: { include: { rol: { select: { id: true, nombre: true } } } },
        sedes: { include: { sede: true } },
        // Lo que estorba para borrar la cuenta: la papelera lo explica sin hacer clic.
        _count: { select: { avisosCreados: true, sessions: { where: { expiresAt: { gt: new Date() } } } } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.rol.findMany({ orderBy: { nombre: 'asc' } }),
    prisma.sede.findMany({ where: { activa: true }, include: { ciudad: true }, orderBy: { nombre: 'asc' } }),
    prisma.auditLog.groupBy({ by: ['userId'], _count: { _all: true } }),
  ])
  const actividadPorUsuario = new Map(actividad.map((a) => [a.userId, a._count._all]))

  /** Por qué NO se puede borrar la cuenta, o null si sí (todo lo que estorba, de una vez). */
  function motivoNoEliminar(u: (typeof usuarios)[number]): string | null {
    if (u.id === sesion.id) return 'No puedes eliminar tu propia cuenta.'
    const registros = actividadPorUsuario.get(u.id) ?? 0
    const estorbos = [
      u.colaborador ? 'es el usuario de un colaborador' : null,
      registros > 0 ? `tiene ${registros} registro(s) de actividad` : null,
      u._count.sessions > 0 ? `tiene ${u._count.sessions} sesión(es) abierta(s)` : null,
      u._count.avisosCreados > 0 ? `publicó ${u._count.avisosCreados} aviso(s)` : null,
    ].filter(Boolean)
    if (estorbos.length === 0) return null
    return `No se puede eliminar: ${estorbos.join(', ')}. Desactívalo en su lugar (estado Inactivo o Bloqueado).`
  }

  return (
    <div>
      {/* El título va en el cliente: el + de "Nuevo usuario" abre su diálogo. */}
      <UsuariosCliente
        usuarios={usuarios.map((u) => ({
          id: u.id,
          nombre: u.name,
          email: u.email,
          fotoUrl: u.colaborador ? urlFoto(u.colaborador.id, u.colaborador.fotoPath, true) : null,
          rolId: u.rolId,
          rolNombre: u.rol.nombre,
          rolIdsExtra: u.rolesExtra.map((r) => r.rolId),
          rolNombresExtra: u.rolesExtra.map((r) => r.rol.nombre),
          estado: u.estado,
          telefonoE164: u.telefonoE164,
          debeCambiarPassword: u.debeCambiarPassword,
          ultimoAcceso: u.ultimoAcceso?.toISOString() ?? null,
          sedeIds: u.sedes.map((s) => s.sedeId),
          sedeNombres: u.sedes.map((s) => s.sede.nombre),
          motivoBloqueo: motivoNoEliminar(u),
        }))}
        roles={roles.map((r) => ({ id: r.id, nombre: r.nombre }))}
        sedes={sedes.map((s) => ({ id: s.id, nombre: s.nombre, ciudad: s.ciudad.nombre }))}
        puedeCrear={puedeCrear}
        puedeEditar={puedeEditar}
        puedeEliminar={puedeEliminar}
      />
    </div>
  )
}
