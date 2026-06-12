import { NextResponse } from 'next/server'
import { obtenerSesion } from '@/server/sesion'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

/** Lista las últimas notificaciones del usuario + contador de no leídas (para la campana). */
export async function GET() {
  const usuario = await obtenerSesion()
  if (!usuario) return NextResponse.json({ noLeidas: 0, notificaciones: [] })

  const [noLeidas, notificaciones] = await Promise.all([
    prisma.notificacion.count({ where: { userId: usuario.id, leida: false } }),
    prisma.notificacion.findMany({
      where: { userId: usuario.id },
      orderBy: { creadoEn: 'desc' },
      take: 20,
    }),
  ])

  return NextResponse.json({
    noLeidas,
    notificaciones: notificaciones.map((n) => ({
      id: n.id,
      titulo: n.titulo,
      mensaje: n.mensaje,
      enlace: n.enlace,
      leida: n.leida,
      creadoEn: n.creadoEn.toISOString(),
    })),
  })
}
