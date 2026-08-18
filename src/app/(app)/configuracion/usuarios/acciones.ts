'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { auth } from '@/lib/auth'
import { accion, ErrorNegocio } from '@/server/accion'
import { auditar } from '@/lib/auditoria'
import { enviarCorreo } from '@/server/notificaciones/correo'
import { crearUsuarioSchema, editarUsuarioSchema } from '@/lib/validaciones/usuarios'

/**
 * Reemplaza los roles adicionales del usuario. El rol principal se descarta de
 * la lista para no duplicarlo: ya vive en `User.rolId`.
 */
async function guardarRolesExtra(userId: string, rolPrincipalId: string, rolIdsExtra: string[]) {
  const ids = [...new Set(rolIdsExtra)].filter((id) => id !== rolPrincipalId)
  await prisma.usuarioRol.deleteMany({ where: { userId } })
  if (ids.length > 0) {
    await prisma.usuarioRol.createMany({ data: ids.map((rolId) => ({ userId, rolId })) })
  }
}

/** Nombres de los roles adicionales, para dejar rastro legible en auditoría. */
async function nombresRoles(rolIdsExtra: string[], rolPrincipalId: string): Promise<string> {
  const ids = [...new Set(rolIdsExtra)].filter((id) => id !== rolPrincipalId)
  if (ids.length === 0) return ''
  const roles = await prisma.rol.findMany({ where: { id: { in: ids } }, select: { nombre: true } })
  return roles.map((r) => r.nombre).join(', ')
}

/** Genera una contraseña temporal robusta (cumple política mínima). */
function passwordTemporal(): string {
  const base = randomBytes(9).toString('base64').replace(/[+/=]/g, '')
  return `Sg-${base}9*`
}

export const crearUsuario = accion(
  { modulo: 'usuarios', accion: 'CREAR', schema: crearUsuarioSchema },
  async (datos) => {
    const existe = await prisma.user.findUnique({ where: { email: datos.email } })
    if (existe) throw new ErrorNegocio('Ya existe un usuario con ese correo.')

    const rol = await prisma.rol.findUniqueOrThrow({ where: { id: datos.rolId } })
    const tmp = passwordTemporal()

    const creado = await auth.api.createUser({
      body: {
        email: datos.email,
        password: tmp,
        name: datos.nombre,
        role: rol.nombre === 'Administrador' ? 'admin' : 'user',
        data: {
          rolId: datos.rolId,
          estado: 'ACTIVO',
          debeCambiarPassword: true,
          telefonoE164: datos.telefonoE164 || null,
        },
      },
    })

    if (datos.sedeIds.length > 0) {
      await prisma.usuarioSede.createMany({
        data: datos.sedeIds.map((sedeId) => ({ userId: creado.user.id, sedeId })),
      })
    }
    await guardarRolesExtra(creado.user.id, datos.rolId, datos.rolIdsExtra)

    const extra = await nombresRoles(datos.rolIdsExtra, datos.rolId)
    await auditar('CREAR', 'User', {
      registroId: creado.user.id,
      descripcion: `Usuario creado: ${datos.email} (rol ${rol.nombre}${extra ? ` + ${extra}` : ''})`,
    })

    const url = process.env.NEXT_PUBLIC_APP_URL ?? 'https://gestor-empleados-iota.vercel.app'
    await enviarCorreo({
      para: datos.email,
      asunto: 'Tu acceso a la Plataforma Smart Gadgets',
      html: `
        <p>Hola ${datos.nombre},</p>
        <p>Se creó tu cuenta en la plataforma de gestión humana de Smart Gadgets.</p>
        <p><b>Correo:</b> ${datos.email}<br/><b>Contraseña temporal:</b> ${tmp}</p>
        <p>Ingresa en <a href="${url}/login">${url}/login</a>. Por seguridad, el sistema te pedirá
        crear una contraseña nueva en tu primer ingreso.</p>
        <p>Rol asignado: <b>${rol.nombre}</b>.</p>`,
    })

    revalidatePath('/configuracion/usuarios')
    return { id: creado.user.id }
  },
)

export const editarUsuario = accion(
  { modulo: 'usuarios', accion: 'EDITAR', schema: editarUsuarioSchema },
  async (datos) => {
    const rol = await prisma.rol.findUniqueOrThrow({ where: { id: datos.rolId } })
    await dbAuditado.user.update({
      where: { id: datos.id },
      data: {
        name: datos.nombre,
        rolId: datos.rolId,
        estado: datos.estado,
        telefonoE164: datos.telefonoE164 || null,
        role: rol.nombre === 'Administrador' ? 'admin' : 'user',
        banned: datos.estado === 'BLOQUEADO',
      },
    })
    // Reemplaza las sedes asignadas
    await prisma.usuarioSede.deleteMany({ where: { userId: datos.id } })
    if (datos.sedeIds.length > 0) {
      await prisma.usuarioSede.createMany({
        data: datos.sedeIds.map((sedeId) => ({ userId: datos.id, sedeId })),
      })
    }
    await guardarRolesExtra(datos.id, datos.rolId, datos.rolIdsExtra)
    revalidatePath('/configuracion/usuarios')
  },
)

export const reenviarAcceso = accion(
  { modulo: 'usuarios', accion: 'EDITAR', schema: editarUsuarioSchema.pick({ id: true }) },
  async ({ id }) => {
    const usuario = await prisma.user.findUniqueOrThrow({ where: { id } })
    const tmp = passwordTemporal()
    await auth.api.setUserPassword({ body: { userId: id, newPassword: tmp } })
    await prisma.user.update({ where: { id }, data: { debeCambiarPassword: true } })

    const url = process.env.NEXT_PUBLIC_APP_URL ?? 'https://gestor-empleados-iota.vercel.app'
    await enviarCorreo({
      para: usuario.email,
      asunto: 'Nueva contraseña temporal — Plataforma Smart Gadgets',
      html: `<p>Hola ${usuario.name},</p><p>Se generó una nueva contraseña temporal: <b>${tmp}</b></p>
        <p>Ingresa en <a href="${url}/login">${url}/login</a> y créala de nuevo en tu primer acceso.</p>`,
    })
    await auditar('EDITAR', 'User', { registroId: id, descripcion: 'Reenvío de acceso (contraseña temporal)' })
    revalidatePath('/configuracion/usuarios')
  },
)
