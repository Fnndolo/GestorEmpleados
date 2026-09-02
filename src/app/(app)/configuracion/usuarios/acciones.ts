'use server'

import { urlApp } from '@/lib/app-url'
import { passwordTemporal } from '@/server/password-temporal'
import { headers } from 'next/headers'
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

/**
 * Genera una contraseña temporal nueva, la deja pendiente de cambio en el primer
 * ingreso y la envía al buzón indicado. `correo` se pasa aparte del usuario
 * porque al corregir un correo mal registrado hay que escribirle al nuevo, no al
 * que quedó guardado.
 */
async function enviarClaveTemporal(userId: string, nombre: string, correo: string) {
  const tmp = passwordTemporal()
  // `setUserPassword` pasa por adminMiddleware: sin las cabeceras de la petición
  // no ve la sesión de quien llama y responde UNAUTHORIZED.
  await auth.api.setUserPassword({
    body: { userId, newPassword: tmp },
    headers: await headers(),
  })
  await prisma.user.update({ where: { id: userId }, data: { debeCambiarPassword: true } })
  await enviarCorreo({
    para: correo,
    asunto: 'Nueva contraseña temporal — Plataforma Smart Gadgets',
    html: `<p>Hola ${nombre},</p><p>Se generó una nueva contraseña temporal: <b>${tmp}</b></p>
      <p>Ingresa en <a href="${urlApp('/login')}">${urlApp('/login')}</a> con el correo
      <b>${correo}</b> y crea tu contraseña definitiva en el primer acceso.</p>`,
  })
}

/**
 * Cierra las sesiones abiertas del usuario. Al corregir un correo equivocado
 * puede haber alguien más dentro con la clave vieja, así que no basta con
 * cambiar la contraseña. No es crítico: si falla, no tumba la operación.
 */
async function cerrarSesiones(userId: string) {
  try {
    // Igual que setUserPassword, este endpoint exige la sesión de quien llama.
    await auth.api.revokeUserSessions({ body: { userId }, headers: await headers() })
  } catch (e) {
    console.error('No se pudieron cerrar las sesiones del usuario:', e)
  }
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

    await enviarCorreo({
      para: datos.email,
      asunto: 'Tu acceso a la Plataforma Smart Gadgets',
      html: `
        <p>Hola ${datos.nombre},</p>
        <p>Se creó tu cuenta en la plataforma de gestión humana de Smart Gadgets.</p>
        <p><b>Correo:</b> ${datos.email}<br/><b>Contraseña temporal:</b> ${tmp}</p>
        <p>Ingresa en <a href="${urlApp('/login')}">${urlApp('/login')}</a>. Por seguridad, el sistema te pedirá
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
    const previo = await prisma.user.findUniqueOrThrow({
      where: { id: datos.id },
      select: { email: true, colaborador: { select: { id: true, emailPersonal: true } } },
    })

    const email = datos.email.trim().toLowerCase()
    const cambioCorreo = email !== previo.email.toLowerCase()
    if (cambioCorreo) {
      const ocupado = await prisma.user.findUnique({ where: { email }, select: { id: true } })
      if (ocupado && ocupado.id !== datos.id) {
        throw new ErrorNegocio('Ya hay otro usuario con ese correo.')
      }
    }

    await dbAuditado.user.update({
      where: { id: datos.id },
      data: {
        name: datos.nombre,
        email,
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

    if (cambioCorreo) {
      // La ficha del colaborador lleva su propio correo personal. Solo se
      // arrastra cuando venía igual al de acceso: si el admin lo puso distinto
      // a propósito, se respeta.
      const col = previo.colaborador
      if (col && col.emailPersonal?.toLowerCase() === previo.email.toLowerCase()) {
        await dbAuditado.colaborador.update({
          where: { id: col.id },
          data: { emailPersonal: email },
        })
      }
      await auditar('EDITAR', 'User', {
        registroId: datos.id,
        descripcion: `Correo de acceso corregido: ${previo.email} → ${email}`,
      })
      await cerrarSesiones(datos.id)
    }

    // A partir de aquí los datos YA quedaron guardados. Si falla el envío de la
    // clave (Better Auth o el correo), no se puede reportar la acción entera
    // como fallida: el admin creería que no se cambió nada y lo intentaría otra
    // vez sobre un correo que ya cambió.
    let accesoEnviado = false
    let errorAcceso: string | null = null
    if (datos.reenviarAcceso) {
      try {
        await enviarClaveTemporal(datos.id, datos.nombre, email)
        await auditar('EDITAR', 'User', {
          registroId: datos.id,
          descripcion: `Reenvío de acceso a ${email} (contraseña temporal)`,
        })
        accesoEnviado = true
      } catch (e) {
        console.error('No se pudo enviar la contraseña temporal:', e)
        errorAcceso = 'No se pudo enviar la contraseña temporal. Usa el botón de reenviar acceso.'
        await auditar('EDITAR', 'User', {
          registroId: datos.id,
          descripcion: `Falló el envío de la contraseña temporal a ${email}`,
        })
      }
    }

    revalidatePath('/configuracion/usuarios')
    return { correoCambiado: cambioCorreo, accesoEnviado, errorAcceso }
  },
)

export const reenviarAcceso = accion(
  { modulo: 'usuarios', accion: 'EDITAR', schema: editarUsuarioSchema.pick({ id: true }) },
  async ({ id }) => {
    const usuario = await prisma.user.findUniqueOrThrow({ where: { id } })
    await enviarClaveTemporal(id, usuario.name, usuario.email)
    await auditar('EDITAR', 'User', {
      registroId: id,
      descripcion: `Reenvío de acceso a ${usuario.email} (contraseña temporal)`,
    })
    revalidatePath('/configuracion/usuarios')
  },
)
