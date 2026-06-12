import { requerirPermiso } from '@/server/sesion'
import { tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { UsuariosCliente } from './usuarios-cliente'

export const metadata = { title: 'Usuarios · Configuración' }

export default async function UsuariosPage() {
  const sesion = await requerirPermiso('usuarios', 'VER')
  const puedeCrear = tienePermiso(sesion, 'usuarios', 'CREAR')
  const puedeEditar = tienePermiso(sesion, 'usuarios', 'EDITAR')

  const [usuarios, roles, sedes] = await Promise.all([
    prisma.user.findMany({
      include: { rol: true, sedes: { include: { sede: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.rol.findMany({ orderBy: { nombre: 'asc' } }),
    prisma.sede.findMany({ where: { activa: true }, include: { ciudad: true }, orderBy: { nombre: 'asc' } }),
  ])

  return (
    <div className="mx-auto max-w-5xl">
      <Encabezado
        titulo="Usuarios"
        descripcion="Crea cuentas, asigna rol y sedes. La invitación se envía por correo con una contraseña temporal."
      />
      <UsuariosCliente
        usuarios={usuarios.map((u) => ({
          id: u.id,
          nombre: u.name,
          email: u.email,
          rolId: u.rolId,
          rolNombre: u.rol.nombre,
          estado: u.estado,
          telefonoE164: u.telefonoE164,
          debeCambiarPassword: u.debeCambiarPassword,
          ultimoAcceso: u.ultimoAcceso?.toISOString() ?? null,
          sedeIds: u.sedes.map((s) => s.sedeId),
          sedeNombres: u.sedes.map((s) => s.sede.nombre),
        }))}
        roles={roles.map((r) => ({ id: r.id, nombre: r.nombre }))}
        sedes={sedes.map((s) => ({ id: s.id, nombre: s.nombre, ciudad: s.ciudad.nombre }))}
        puedeCrear={puedeCrear}
        puedeEditar={puedeEditar}
      />
    </div>
  )
}
