import 'server-only'
import { prisma } from '@/lib/db'
import { ErrorNegocio } from '@/server/accion'
import { normalizarCedula, tramosAsistencia, type TramoAsistencia } from '@/server/asistencia/cliente'
import { avisar, usuarioDeColaborador } from '@/server/notificaciones/avisar'
import { textoResumenDia } from '@/lib/asistencia/resumen-dia'
import { hoyBogotaISO } from '@/lib/fechas'

/**
 * "Lo que AsistencIA registró hoy" de una persona.
 *
 * Mientras las horas extra estén en prueba esto NO se le manda a nadie: se
 * mira desde Nómina → Horas extra, que es donde se está revisando que los
 * números cuadren. Cuando el módulo salga de pruebas, `enviarResumenDiaAsistencia`
 * es lo mismo pero entregado al colaborador (campana + push).
 */

export type ReporteDia = {
  colaborador: string
  /** Fecha de hoy en Bogotá, ISO. */
  fecha: string
  tramos: { horaInicio: string; horaFin: string; tipoHora: string; horas: number }[]
  totalHoras: number
  /** El mismo texto que vería el colaborador el día que esto se le envíe. */
  mensaje: string
}

async function tramosDeHoy(colaboradorId: string): Promise<{ nombre: string; hoy: string; tramos: TramoAsistencia[] }> {
  const colab = await prisma.colaborador.findUniqueOrThrow({
    where: { id: colaboradorId },
    select: { nombres: true, apellidos: true, numeroDocumento: true },
  })
  const hoy = hoyBogotaISO()
  const cedula = normalizarCedula(colab.numeroDocumento)
  const tramos = (await tramosAsistencia({ desde: hoy, hasta: hoy })).filter((t) => normalizarCedula(t.documento) === cedula)
  return { nombre: `${colab.nombres} ${colab.apellidos}`, hoy, tramos }
}

/** El reporte del día para mirarlo desde la pantalla de nómina. No avisa a nadie. */
export async function reporteDiaAsistencia(colaboradorId: string): Promise<ReporteDia> {
  const { nombre, hoy, tramos } = await tramosDeHoy(colaboradorId)
  return {
    colaborador: nombre,
    fecha: hoy,
    tramos: tramos.map((t) => ({ horaInicio: t.horaInicio, horaFin: t.horaFin, tipoHora: t.tipoHora, horas: t.horas })),
    totalHoras: tramos.reduce((s, t) => s + t.horas, 0),
    mensaje: textoResumenDia(hoy, tramos).mensaje,
  }
}

/**
 * Lo mismo, pero entregado al colaborador como notificación (campana + push).
 * Todavía no se usa desde ninguna pantalla: queda listo para cuando las horas
 * extra dejen de estar en prueba y el aviso salga solo al final del día.
 */
export async function enviarResumenDiaAsistencia(colaboradorId: string): Promise<{ tramos: number; mensaje: string }> {
  const userId = await usuarioDeColaborador(colaboradorId)
  if (!userId) throw new ErrorNegocio('Este colaborador no tiene usuario de acceso: no hay a quién mandarle la notificación.')

  const { hoy, tramos } = await tramosDeHoy(colaboradorId)
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
