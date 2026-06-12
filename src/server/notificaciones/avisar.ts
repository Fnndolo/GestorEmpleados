import 'server-only'
import { prisma } from '@/lib/db'

/**
 * Crea una notificación in-app para un usuario. `dedupeKey` evita duplicados;
 * si no se pasa, se genera una única basada en el momento (siempre nueva).
 */
export async function notificarUsuario(
  userId: string,
  titulo: string,
  mensaje: string,
  enlace?: string,
  dedupeKey?: string,
): Promise<void> {
  const key = dedupeKey ?? `aviso:${userId}:${titulo}:${Date.now()}`
  try {
    await prisma.notificacion.create({
      data: { userId, titulo, mensaje, enlace: enlace ?? null, dedupeKey: key },
    })
  } catch {
    /* dedupeKey duplicado → ya existe, idempotente */
  }
}
