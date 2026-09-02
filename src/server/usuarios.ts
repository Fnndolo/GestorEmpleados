import 'server-only'
import { urlApp } from '@/lib/app-url'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'
import { auditar } from '@/lib/auditoria'
import { enviarCorreo } from '@/server/notificaciones/correo'
import { passwordTemporal } from '@/server/password-temporal'

/**
 * Crea el usuario de acceso de un colaborador con un rol dado, lo vincula a la ficha
 * y le envía la invitación por correo con su contraseña temporal. Devuelve null si ya
 * existía un usuario con ese correo (no duplica). El cambio de contraseña es forzado.
 */
export async function crearUsuarioColaborador(opts: {
  email: string
  nombre: string
  rolId: string
  colaboradorId: string
  sedeId?: string | null
}): Promise<{ userId: string } | null> {
  const email = opts.email.trim().toLowerCase()
  const existe = await prisma.user.findUnique({ where: { email } })
  if (existe) {
    // Si el colaborador no estaba vinculado, lo vinculamos al usuario existente
    await prisma.colaborador.update({ where: { id: opts.colaboradorId }, data: { usuarioId: existe.id } }).catch(() => {})
    return null
  }

  const rol = await prisma.rol.findUniqueOrThrow({ where: { id: opts.rolId } })
  const tmp = passwordTemporal()
  const creado = await auth.api.createUser({
    body: {
      email,
      password: tmp,
      name: opts.nombre,
      role: rol.nombre === 'Administrador' ? 'admin' : 'user',
      data: { rolId: opts.rolId, estado: 'ACTIVO', debeCambiarPassword: true },
    },
  })

  await prisma.colaborador.update({ where: { id: opts.colaboradorId }, data: { usuarioId: creado.user.id } })
  if (opts.sedeId) {
    await prisma.usuarioSede.create({ data: { userId: creado.user.id, sedeId: opts.sedeId } }).catch(() => {})
  }
  await auditar('CREAR', 'User', { registroId: creado.user.id, descripcion: `Usuario creado para colaborador: ${email} (rol ${rol.nombre})` })

  await enviarCorreo({
    para: email,
    asunto: 'Tu acceso a la Plataforma Smart Gadgets',
    html: `
      <p>Hola ${opts.nombre},</p>
      <p>Se creó tu cuenta en la plataforma de gestión humana de Smart Gadgets.</p>
      <p><b>Correo:</b> ${email}<br/><b>Contraseña temporal:</b> ${tmp}</p>
      <p>Ingresa en <a href="${urlApp('/login')}">${urlApp('/login')}</a>. Por seguridad, el sistema te pedirá
      crear una contraseña nueva en tu primer ingreso.</p>
      <p>Al entrar, ve a <b>Autoservicio → Mi información</b> para completar tus datos personales,
      de contacto, seguridad social y bancarios.</p>
      <p>Rol asignado: <b>${rol.nombre}</b>.</p>`,
  }).catch((e) => { console.error('No se pudo enviar la invitación por correo:', e) })

  return { userId: creado.user.id }
}
