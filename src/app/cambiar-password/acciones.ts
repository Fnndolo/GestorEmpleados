'use server'

import { prisma } from '@/lib/db'
import { obtenerSesion } from '@/server/sesion'

/** Limpia el flag de cambio obligatorio tras cambiar la contraseña. */
export async function marcarPasswordCambiada(): Promise<{ ok: boolean }> {
  const usuario = await obtenerSesion()
  if (!usuario) return { ok: false }
  await prisma.user.update({
    where: { id: usuario.id },
    data: { debeCambiarPassword: false },
  })
  return { ok: true }
}
