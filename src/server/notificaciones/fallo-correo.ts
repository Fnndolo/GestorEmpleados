import 'server-only'
import { prisma } from '@/lib/db'

/**
 * Avisa en la campana a los administradores que un correo no salió.
 *
 * Solo in-app (nunca por correo: si el correo está caído, avisar por correo no
 * sirve y podría encadenar fallos). Un aviso por destinatario y asunto al día,
 * para no llenar la campana con cada reintento.
 */
export async function avisarFalloCorreo(para: string, asunto: string, error: unknown): Promise<void> {
  try {
    const admins = await prisma.user.findMany({
      where: { estado: 'ACTIVO', rol: { nombre: 'Administrador' } },
      select: { id: true },
    })
    const dia = new Date().toISOString().slice(0, 10)
    const detalle = error instanceof Error ? error.message : String(error)
    for (const a of admins) {
      await prisma.notificacion
        .create({
          data: {
            userId: a.id,
            titulo: 'No se pudo enviar un correo',
            mensaje: `A ${para} · «${asunto}». ${detalle.slice(0, 200)}`,
            enlace: '/configuracion/correos',
            dedupeKey: `fallo-correo:${a.id}:${para}:${asunto}:${dia}`,
          },
        })
        .catch(() => { /* ya avisado hoy */ })
    }
  } catch {
    /* el aviso nunca debe romper el flujo que mandaba el correo */
  }
}
