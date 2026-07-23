import { NextResponse } from 'next/server'
import { obtenerSesion } from '@/server/sesion'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

/** Lista las últimas notificaciones del usuario + contador de no leídas (para la campana). */
export async function GET() {
  const usuario = await obtenerSesion()
  if (!usuario) return NextResponse.json({ noLeidas: 0, notificaciones: [] })

  const [noLeidas, notificaciones, sinPopup] = await Promise.all([
    prisma.notificacion.count({ where: { userId: usuario.id, leida: false } }),
    prisma.notificacion.findMany({
      where: { userId: usuario.id },
      orderBy: { creadoEn: 'desc' },
      take: 20,
    }),
    // Eventos que el administrador desactivó para el pop-up (la campana omite su toast).
    prisma.preferenciaNotificacion.findMany({ where: { popup: false }, select: { evento: true } }),
  ])

  return NextResponse.json({
    noLeidas,
    popupDesactivados: sinPopup.map((p) => p.evento),
    notificaciones: notificaciones.map((n) => ({
      id: n.id,
      titulo: n.titulo,
      mensaje: n.mensaje,
      enlace: n.enlace,
      leida: n.leida,
      evento: n.evento,
      creadoEn: n.creadoEn.toISOString(),
    })),
  })
}
