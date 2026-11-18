'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { accion } from '@/server/accion'
import { prisma } from '@/lib/db'
import { enviarCorreo } from '@/server/notificaciones/correo'

async function reintentar(id: string): Promise<boolean> {
  const m = await prisma.mensajeSaliente.findUnique({ where: { id } })
  if (!m || m.canal !== 'EMAIL' || m.estado === 'ENVIADO') return true
  try {
    await enviarCorreo({ para: m.destino, asunto: m.asunto ?? 'Notificación', html: m.cuerpo })
    await prisma.mensajeSaliente.update({
      where: { id },
      data: { estado: 'ENVIADO', enviadoEn: new Date(), intentos: { increment: 1 }, error: null },
    })
    return true
  } catch (e) {
    await prisma.mensajeSaliente.update({
      where: { id },
      data: { intentos: { increment: 1 }, error: e instanceof Error ? e.message : 'error' },
    })
    return false
  }
}

/** Reintenta uno o todos los correos pendientes/fallidos. */
export const reintentarCorreos = accion(
  { modulo: 'configuracion', accion: 'EDITAR', schema: z.object({ id: z.string().uuid().optional() }) },
  async (d) => {
    const ids = d.id
      ? [d.id]
      : (await prisma.mensajeSaliente.findMany({
          where: { canal: 'EMAIL', estado: { in: ['EN_COLA', 'FALLIDO'] } },
          select: { id: true },
          take: 100,
        })).map((m) => m.id)
    let enviados = 0
    for (const id of ids) if (await reintentar(id)) enviados++
    revalidatePath('/configuracion/correos')
    return { enviados, fallidos: ids.length - enviados }
  },
)

/** Descarta un correo que ya no hace falta enviar (p. ej. dirección mala). */
export const descartarCorreo = accion(
  { modulo: 'configuracion', accion: 'EDITAR', schema: z.object({ id: z.string().uuid() }) },
  async (d) => {
    await prisma.mensajeSaliente.update({ where: { id: d.id }, data: { estado: 'DESCARTADO' } })
    revalidatePath('/configuracion/correos')
    return { ok: true }
  },
)
