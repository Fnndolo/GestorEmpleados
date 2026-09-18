'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'
import { parseFechaISO } from '@/lib/fechas'
import { notificarUsuario } from '@/server/notificaciones/avisar'
import { enviarPush } from '@/server/notificaciones/push'
import { puedeGestionarAvisos, usuariosDeAudiencia } from '@/server/avisos'
import type { UsuarioSesion } from '@/lib/permisos/tipos'

/**
 * Gestión de los avisos de la plataforma. Los publican el administrador y
 * Talento Humano; leerlos (y marcarlos como leídos) puede cualquiera al que le
 * toquen. Se cuelgan del permiso de editar colaboradores —que ambos tienen—
 * más la comprobación de rol, para no abrir un módulo RBAC nuevo por esto.
 */

const RUTAS = ['/avisos', '/autoservicio', '/inicio']
const refrescar = () => RUTAS.forEach((r) => revalidatePath(r))

const gestor = (u: UsuarioSesion) => {
  if (!puedeGestionarAvisos(u)) throw new ErrorNegocio('Solo el administrador y Talento Humano publican avisos.')
}

const avisoSchema = z.object({
  titulo: z.string().trim().min(3, 'Escribe el título.').max(120),
  resumen: z.string().trim().min(3, 'Escribe el resumen.').max(300),
  detalle: z.string().trim().max(4000).optional().or(z.literal('')),
  tipo: z.enum(['NUEVO_MODULO', 'MEJORA', 'CAMBIO']),
  enlace: z.string().trim().max(200).regex(/^(\/[^\s]*)?$/, 'El enlace debe ser una ruta de la app, como /autoservicio/dotacion.').optional().or(z.literal('')),
  vigenteHasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  audiencia: z.object({
    roles: z.array(z.string().trim().min(1)).max(20).default([]),
    vinculos: z.array(z.enum(['LABORAL', 'OPS'])).max(2).default([]),
    sedeIds: z.array(z.uuid()).max(50).default([]),
  }),
})

const datosAviso = (d: z.infer<typeof avisoSchema>) => ({
  titulo: d.titulo,
  resumen: d.resumen,
  detalle: d.detalle || null,
  tipo: d.tipo,
  enlace: d.enlace || null,
  vigenteHasta: parseFechaISO(d.vigenteHasta || null),
  audiencia: d.audiencia,
})

/** Crea el aviso como borrador: primero se revisa (y se le pone la captura), luego se publica. */
export const crearAviso = accion(
  { modulo: 'colaboradores', accion: 'EDITAR', schema: avisoSchema },
  async (d, usuario) => {
    gestor(usuario)
    const a = await dbAuditado.aviso.create({ data: { ...datosAviso(d), creadoPorId: usuario.id } })
    refrescar()
    return { id: a.id }
  },
)

export const editarAviso = accion(
  { modulo: 'colaboradores', accion: 'EDITAR', schema: avisoSchema.extend({ id: z.uuid() }) },
  async ({ id, ...d }, usuario) => {
    gestor(usuario)
    const a = await prisma.aviso.findUniqueOrThrow({ where: { id }, select: { estado: true } })
    if (a.estado === 'ARCHIVADO') throw new ErrorNegocio('Un aviso archivado no se edita; crea uno nuevo.')
    await dbAuditado.aviso.update({ where: { id }, data: datosAviso(d) })
    refrescar()
    return { ok: true }
  },
)

/**
 * Publica: desde ese momento le aparece a su audiencia (tarjeta, icono de
 * avisos e historial) y cada persona recibe la notificación en la app y en el
 * celular. Sin correo: el correo va al mínimo.
 */
export const publicarAviso = accion(
  { modulo: 'colaboradores', accion: 'EDITAR', schema: z.object({ id: z.uuid() }) },
  async ({ id }, usuario) => {
    gestor(usuario)
    const a = await prisma.aviso.findUniqueOrThrow({ where: { id } })
    if (a.estado === 'PUBLICADO') throw new ErrorNegocio('Este aviso ya está publicado.')
    await dbAuditado.aviso.update({ where: { id }, data: { estado: 'PUBLICADO', publicadoEn: new Date() } })
    const destinatarios = await usuariosDeAudiencia(a.audiencia)
    await avisarA(destinatarios.map((u) => u.id), a)
    refrescar()
    return { notificados: destinatarios.length }
  },
)

/** Vuelve a notificar solo a quienes no lo han marcado como leído. */
export const reavisar = accion(
  { modulo: 'colaboradores', accion: 'EDITAR', schema: z.object({ id: z.uuid() }) },
  async ({ id }, usuario) => {
    gestor(usuario)
    const a = await prisma.aviso.findUniqueOrThrow({ where: { id } })
    if (a.estado !== 'PUBLICADO') throw new ErrorNegocio('Solo se reenvía un aviso publicado.')
    const [destinatarios, lecturas] = await Promise.all([
      usuariosDeAudiencia(a.audiencia),
      prisma.avisoLectura.findMany({ where: { avisoId: id }, select: { userId: true } }),
    ])
    const leyeron = new Set(lecturas.map((l) => l.userId))
    const pendientes = destinatarios.filter((u) => !leyeron.has(u.id)).map((u) => u.id)
    await avisarA(pendientes, a, true)
    return { notificados: pendientes.length }
  },
)

export const archivarAviso = accion(
  { modulo: 'colaboradores', accion: 'EDITAR', schema: z.object({ id: z.uuid() }) },
  async ({ id }, usuario) => {
    gestor(usuario)
    await dbAuditado.aviso.update({ where: { id }, data: { estado: 'ARCHIVADO' } })
    refrescar()
    return { ok: true }
  },
)

export const eliminarAviso = accion(
  { modulo: 'colaboradores', accion: 'EDITAR', schema: z.object({ id: z.uuid() }) },
  async ({ id }, usuario) => {
    gestor(usuario)
    const a = await prisma.aviso.findUniqueOrThrow({ where: { id }, select: { estado: true } })
    if (a.estado === 'PUBLICADO') throw new ErrorNegocio('Un aviso publicado se archiva, no se elimina: la gente ya lo vio.')
    await dbAuditado.aviso.delete({ where: { id } })
    refrescar()
    return { ok: true }
  },
)

/** «Entendido»: el aviso deja de destacarse para esta persona. */
export const marcarAvisoLeido = accion(
  { modulo: 'autoservicio', accion: 'VER', schema: z.object({ id: z.uuid() }) },
  async ({ id }, usuario) => {
    await prisma.avisoLectura.upsert({
      where: { avisoId_userId: { avisoId: id, userId: usuario.id } },
      create: { avisoId: id, userId: usuario.id },
      update: {},
    })
    refrescar()
    return { ok: true }
  },
)

/** Quiénes lo han leído y quiénes no, para la gestión. */
export const lecturasDeAviso = accion(
  { modulo: 'colaboradores', accion: 'EDITAR', schema: z.object({ id: z.uuid() }) },
  async ({ id }, usuario) => {
    gestor(usuario)
    const a = await prisma.aviso.findUniqueOrThrow({ where: { id }, select: { audiencia: true } })
    const [destinatarios, lecturas] = await Promise.all([
      usuariosDeAudiencia(a.audiencia),
      prisma.avisoLectura.findMany({ where: { avisoId: id }, select: { userId: true } }),
    ])
    const leyeron = new Set(lecturas.map((l) => l.userId))
    const usuarios = await prisma.user.findMany({ where: { id: { in: destinatarios.map((u) => u.id) } }, select: { id: true, name: true } })
    return {
      total: destinatarios.length,
      leidos: usuarios.filter((u) => leyeron.has(u.id)).map((u) => u.name).sort(),
      pendientes: usuarios.filter((u) => !leyeron.has(u.id)).map((u) => u.name).sort(),
    }
  },
)

/** Notificación en la app + push a cada destinatario; nunca correo. */
async function avisarA(userIds: string[], a: { id: string; titulo: string; resumen: string }, reenvio = false) {
  const titulo = `Nuevo en la app: ${a.titulo}`
  for (const userId of userIds) {
    await notificarUsuario(userId, titulo, a.resumen, `/avisos?ver=${a.id}`, `aviso:${a.id}:${userId}${reenvio ? `:${Date.now()}` : ''}`, 'aviso_publicado')
    await enviarPush(userId, { titulo, mensaje: a.resumen, enlace: `/avisos?ver=${a.id}` }).catch(() => {})
  }
}
