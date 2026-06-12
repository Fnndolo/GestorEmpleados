import 'server-only'
import { prisma } from '@/lib/db'
import { enviarCorreo } from '@/server/notificaciones/correo'
import { hoyBogota, hoyBogotaISO, formatFechaCorta } from '@/lib/fechas'

const PASO_TITULO: Record<string, string> = {
  PRIMERA: 'Próximo a vencer',
  ULTIMA: 'Vence muy pronto',
  VENCIDO: 'Vencido',
}

/** Usuarios destinatarios de un vencimiento: responsables explícitos + por rol; fallback Admin/RRHH. */
async function destinatarios(vencimientoId: string): Promise<{ id: string; email: string; nombre: string }[]> {
  const resp = await prisma.responsableVencimiento.findMany({ where: { vencimientoId } })
  const userIds = new Set<string>()
  const roles = new Set<string>()
  for (const r of resp) {
    if (r.userId) userIds.add(r.userId)
    if (r.rol) roles.add(r.rol)
  }

  // Fallback: si no hay responsables, notificar a Administrador y Recursos Humanos
  if (userIds.size === 0 && roles.size === 0) {
    roles.add('Administrador')
    roles.add('Recursos Humanos')
  }

  const usuarios = await prisma.user.findMany({
    where: {
      estado: 'ACTIVO',
      OR: [
        { id: { in: [...userIds] } },
        { rol: { nombre: { in: [...roles] } } },
      ],
    },
    select: { id: true, email: true, name: true },
  })
  return usuarios.map((u) => ({ id: u.id, email: u.email, nombre: u.name }))
}

/**
 * Procesa las alertas cuya fecha programada llegó (hoy o antes — catch-up):
 * crea notificaciones in-app y encola correos, de forma idempotente.
 * Devuelve un resumen para el log del cron.
 */
export async function procesarAlertas(): Promise<{ vencidos: number; alertas: number; notificaciones: number; correos: number; hoyISO: string }> {
  const hoy = hoyBogota()
  const hoyISO = hoyBogotaISO()

  // 1) Marcar vencimientos VENCIDOS (fecha pasada, aún activos)
  const vencidos = await prisma.vencimiento.updateMany({
    where: {
      fechaVencimiento: { lt: hoy },
      estado: { in: ['PENDIENTE', 'PRIMERA_ALERTA', 'ULTIMA_ALERTA'] },
    },
    data: { estado: 'VENCIDO' },
  })

  // 2) Alertas pendientes cuyo turno llegó (<= hoy)
  const pendientes = await prisma.alertaVencimiento.findMany({
    where: { despachada: false, fechaProgramada: { lte: hoy } },
    include: { vencimiento: true },
    take: 500,
    orderBy: { fechaProgramada: 'asc' },
  })

  let notificaciones = 0
  let correos = 0

  for (const alerta of pendientes) {
    const v = alerta.vencimiento
    if (v.estado === 'RESUELTO' || v.estado === 'CANCELADO') {
      await prisma.alertaVencimiento.update({ where: { id: alerta.id }, data: { despachada: true, despachadaEn: new Date() } })
      continue
    }

    const users = await destinatarios(v.id)
    const titulo = `${PASO_TITULO[alerta.paso]}: ${v.titulo}`
    const mensaje =
      alerta.paso === 'VENCIDO'
        ? `Venció el ${formatFechaCorta(v.fechaVencimiento)}.`
        : `Vence el ${formatFechaCorta(v.fechaVencimiento)}.`
    const enlace = enlaceDe(v.entidadTipo, v.entidadId)

    for (const u of users) {
      const dedupe = `${alerta.id}:${u.id}`
      // Notificación in-app (idempotente por dedupeKey)
      try {
        await prisma.notificacion.create({
          data: { userId: u.id, titulo, mensaje, enlace, dedupeKey: dedupe },
        })
        notificaciones++
      } catch {
        /* ya existe (P2002) → idempotente */
      }
      // Correo en outbox (idempotente)
      try {
        await prisma.mensajeSaliente.create({
          data: {
            canal: 'EMAIL',
            destino: u.email,
            asunto: `[Smart Gadgets] ${titulo}`,
            cuerpo: `<p>Hola ${u.nombre},</p><p>${titulo}</p><p>${mensaje}</p>${enlace ? `<p><a href="${process.env.NEXT_PUBLIC_APP_URL ?? ''}${enlace}">Ver detalle</a></p>` : ''}`,
            dedupeKey: `mail:${dedupe}`,
          },
        })
        correos++
      } catch {
        /* idempotente */
      }
    }

    // Marcar alerta despachada y avanzar estado del vencimiento
    await prisma.alertaVencimiento.update({
      where: { id: alerta.id },
      data: { despachada: true, despachadaEn: new Date() },
    })
    if (v.estado !== 'VENCIDO') {
      await prisma.vencimiento.update({
        where: { id: v.id },
        data: { estado: alerta.paso === 'PRIMERA' ? 'PRIMERA_ALERTA' : alerta.paso === 'ULTIMA' ? 'ULTIMA_ALERTA' : 'VENCIDO' },
      })
    }
  }

  await procesarOutbox()
  return { vencidos: vencidos.count, alertas: pendientes.length, notificaciones, correos, hoyISO }
}

/** Envía los correos en cola (outbox) con reintentos básicos. */
export async function procesarOutbox(): Promise<number> {
  const enCola = await prisma.mensajeSaliente.findMany({
    where: { canal: 'EMAIL', estado: 'EN_COLA', intentos: { lt: 5 } },
    take: 100,
  })
  let enviados = 0
  for (const m of enCola) {
    try {
      await enviarCorreo({ para: m.destino, asunto: m.asunto ?? 'Notificación', html: m.cuerpo })
      await prisma.mensajeSaliente.update({
        where: { id: m.id },
        data: { estado: 'ENVIADO', enviadoEn: new Date(), intentos: { increment: 1 } },
      })
      enviados++
    } catch (e) {
      const intentos = m.intentos + 1
      await prisma.mensajeSaliente.update({
        where: { id: m.id },
        data: {
          estado: intentos >= 5 ? 'FALLIDO' : 'EN_COLA',
          intentos,
          error: e instanceof Error ? e.message : 'error',
        },
      })
    }
  }
  return enviados
}

function enlaceDe(entidadTipo: string, entidadId: string): string | null {
  switch (entidadTipo) {
    case 'Colaborador':
      return `/colaboradores/${entidadId}`
    case 'Contrato':
      return `/contratos`
    default:
      return '/vencimientos'
  }
}
