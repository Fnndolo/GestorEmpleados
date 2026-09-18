import 'server-only'
import { prisma } from '@/lib/db'
import { ErrorNegocio } from '@/server/accion'
import { normalizarCedula, tramosAsistencia } from '@/server/asistencia/cliente'
import { avisar, usuarioDeColaborador } from '@/server/notificaciones/avisar'
import { textoResumenDia } from '@/lib/asistencia/resumen-dia'
import { hoyBogotaISO } from '@/lib/fechas'

/**
 * "Lo que AsistencIA te registró hoy", mandado al colaborador como
 * notificación (campana + push). Por ahora es un botón de prueba en Nómina →
 * Horas extra; la idea es que después salga solo, al final del día. El texto
 * se arma en `@/lib/asistencia/resumen-dia`.
 */

/** Manda al colaborador el resumen de hoy. Devuelve cuántos tramos le encontró. */
export async function enviarResumenDiaAsistencia(colaboradorId: string): Promise<{ tramos: number; mensaje: string }> {
  const [colab, userId] = await Promise.all([
    prisma.colaborador.findUniqueOrThrow({ where: { id: colaboradorId }, select: { numeroDocumento: true } }),
    usuarioDeColaborador(colaboradorId),
  ])
  if (!userId) throw new ErrorNegocio('Este colaborador no tiene usuario de acceso: no hay a quién mandarle la notificación.')

  const hoy = hoyBogotaISO()
  const cedula = normalizarCedula(colab.numeroDocumento)
  const tramos = (await tramosAsistencia({ desde: hoy, hasta: hoy })).filter((t) => normalizarCedula(t.documento) === cedula)
  const texto = textoResumenDia(hoy, tramos)
  await avisar(userId, {
    evento: 'asistencia_resumen_dia',
    titulo: texto.titulo,
    mensaje: texto.mensaje,
    enlace: '/autoservicio/horas-extra',
    llamadoAccion: 'Ver mis horas extra',
    colaboradorId,
  })
  return { tramos: tramos.length, mensaje: texto.mensaje }
}
