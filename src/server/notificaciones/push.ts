import 'server-only'
import webpush from 'web-push'
import { prisma } from '@/lib/db'

/**
 * Web Push: envía notificaciones del sistema a los dispositivos suscritos del
 * usuario (navegador de escritorio, Android, o PWA instalada en iOS 16.4+).
 * Best-effort: si falla no interrumpe el flujo; las suscripciones muertas
 * (410/404) se eliminan solas.
 */

let configurado = false
function configurar(): boolean {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) return false
  if (!configurado) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:soporte@smartgadgets.com.co', pub, priv)
    configurado = true
  }
  return true
}

export type PayloadPush = { titulo: string; mensaje: string; enlace?: string | null }

/** Envía un push a TODOS los dispositivos suscritos del usuario. */
export async function enviarPush(userId: string, payload: PayloadPush): Promise<void> {
  if (!configurar()) return
  const subs = await prisma.suscripcionPush.findMany({ where: { userId } })
  if (subs.length === 0) return

  const cuerpo = JSON.stringify({ titulo: payload.titulo, mensaje: payload.mensaje, enlace: payload.enlace ?? '/' })
  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          cuerpo,
        )
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        // 404/410: la suscripción ya no existe (permiso revocado, navegador reinstalado)
        if (status === 404 || status === 410) {
          await prisma.suscripcionPush.delete({ where: { id: s.id } }).catch(() => {})
        }
      }
    }),
  )
}
