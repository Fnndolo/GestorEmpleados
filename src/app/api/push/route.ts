import { NextResponse, type NextRequest } from 'next/server'
import { obtenerSesion } from '@/server/sesion'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

/** Registra la suscripción Web Push del dispositivo actual para el usuario logueado. */
export async function POST(req: NextRequest) {
  const usuario = await obtenerSesion()
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = (await req.json()) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json({ error: 'Suscripción inválida' }, { status: 400 })
  }

  // Upsert por endpoint: si el dispositivo ya estaba suscrito (quizá con otro usuario), se reasigna.
  await prisma.suscripcionPush.upsert({
    where: { endpoint: body.endpoint },
    create: {
      userId: usuario.id,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userAgent: req.headers.get('user-agent'),
    },
    update: { userId: usuario.id, p256dh: body.keys.p256dh, auth: body.keys.auth },
  })
  return NextResponse.json({ ok: true })
}

/** Elimina la suscripción del dispositivo actual (desactivar notificaciones). */
export async function DELETE(req: NextRequest) {
  const usuario = await obtenerSesion()
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = (await req.json()) as { endpoint?: string }
  if (!body.endpoint) return NextResponse.json({ error: 'Falta endpoint' }, { status: 400 })
  await prisma.suscripcionPush.deleteMany({ where: { endpoint: body.endpoint, userId: usuario.id } })
  return NextResponse.json({ ok: true })
}
