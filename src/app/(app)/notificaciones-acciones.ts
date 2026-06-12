'use server'

import { prisma } from '@/lib/db'
import { obtenerSesion } from '@/server/sesion'

export async function marcarLeidas(ids?: string[]): Promise<{ ok: boolean }> {
  const usuario = await obtenerSesion()
  if (!usuario) return { ok: false }
  await prisma.notificacion.updateMany({
    where: { userId: usuario.id, leida: false, ...(ids?.length ? { id: { in: ids } } : {}) },
    data: { leida: true },
  })
  return { ok: true }
}
