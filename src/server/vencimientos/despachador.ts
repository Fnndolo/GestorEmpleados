import 'server-only'
import { urlApp } from '@/lib/app-url'
import { prisma } from '@/lib/db'
import { enviarCorreo } from '@/server/notificaciones/correo'
import { hoyBogota, hoyBogotaISO } from '@/lib/fechas'
import { fechaBreve } from '@/lib/notificaciones/texto'
import { mandaCorreo } from '@/lib/notificaciones/catalogo'

/**
 * Texto del aviso: primero la persona, luego qué vence, y la fecha en la
 * segunda línea. Los vencimientos de personas se registran como
 * "Cosa — Nombre Apellido" (documentos, contratos, exámenes); los que no son
 * de nadie (un comité, una obligación legal) se dejan tal cual.
 */
function textoAviso(tituloVencimiento: string, paso: string, fecha: Date): { titulo: string; mensaje: string } {
  const sep = tituloVencimiento.lastIndexOf(' — ')
  let titulo = tituloVencimiento
  if (sep > 0) {
    const cosa = tituloVencimiento.slice(0, sep).trim()
    const persona = tituloVencimiento.slice(sep + 3).trim()
    // "Vence contrato fijo…" → "vence contrato fijo…"; siglas y nombres propios se respetan.
    const cosaMin = cosa.length > 1 && cosa[1] === cosa[1].toLowerCase() ? cosa[0].toLowerCase() + cosa.slice(1) : cosa
    titulo = `${persona}: ${cosaMin}`
  }
  const cuando = fechaBreve(fecha)
  const mensaje = paso === 'VENCIDO' ? `Venció el ${cuando}.` : paso === 'ULTIMA' ? `Vence muy pronto: ${cuando}.` : `Vence el ${cuando}.`
  return { titulo, mensaje }
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

  const prefs = await prisma.preferenciaNotificacion.findMany({ select: { evento: true, correo: true } })
  const conCorreo = mandaCorreo('vencimiento_alerta', Object.fromEntries(prefs.map((p) => [p.evento, p.correo])))

  for (const alerta of pendientes) {
    const v = alerta.vencimiento
    if (v.estado === 'RESUELTO' || v.estado === 'CANCELADO') {
      await prisma.alertaVencimiento.update({ where: { id: alerta.id }, data: { despachada: true, despachadaEn: new Date() } })
      continue
    }

    const users = await destinatarios(v.id)
    const { titulo, mensaje } = textoAviso(v.titulo, alerta.paso, v.fechaVencimiento)
    const enlace = enlaceDe(v.entidadTipo, v.entidadId)
    const colaboradorId = await colaboradorDe(v.entidadTipo, v.entidadId)

    for (const u of users) {
      const dedupe = `${alerta.id}:${u.id}`
      // Notificación in-app (idempotente por dedupeKey)
      try {
        await prisma.notificacion.create({
          data: { userId: u.id, titulo, mensaje, enlace, dedupeKey: dedupe, evento: 'vencimiento_alerta', colaboradorId },
        })
        notificaciones++
      } catch {
        /* ya existe (P2002) → idempotente */
      }
      // Correo en outbox (idempotente), solo si el evento lo tiene encendido en
      // Ajustes: antes salía siempre, saltándose la preferencia que sí respetan
      // los demás avisos.
      if (!conCorreo) continue
      try {
        await prisma.mensajeSaliente.create({
          data: {
            canal: 'EMAIL',
            destino: u.email,
            asunto: `[Smart Gadgets] ${titulo}`,
            cuerpo: `<p>Hola ${u.nombre},</p><p>${titulo}</p><p>${mensaje}</p>${enlace ? `<p><a href="${urlApp(enlace)}">Ver detalle</a></p>` : ''}`,
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

/** De qué colaborador es lo que vence, para ponerle la foto al aviso. */
async function colaboradorDe(entidadTipo: string, entidadId: string): Promise<string | null> {
  try {
    switch (entidadTipo) {
      case 'Colaborador':
        return entidadId
      case 'Documento': {
        const d = await prisma.documento.findUnique({ where: { id: entidadId }, select: { entidadTipo: true, entidadId: true } })
        return d?.entidadTipo === 'Colaborador' ? d.entidadId : null
      }
      case 'Contrato':
        return (await prisma.contrato.findUnique({ where: { id: entidadId }, select: { colaboradorId: true } }))?.colaboradorId ?? null
      case 'ContratoOps':
        return (await prisma.contratoOps.findUnique({ where: { id: entidadId }, select: { colaboradorId: true } }))?.colaboradorId ?? null
      case 'ExamenMedico':
        return (await prisma.examenMedico.findUnique({ where: { id: entidadId }, select: { colaboradorId: true } }))?.colaboradorId ?? null
      default:
        return null
    }
  } catch {
    return null
  }
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
