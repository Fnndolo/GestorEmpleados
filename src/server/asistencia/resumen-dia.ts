import 'server-only'
import { prisma } from '@/lib/db'
import { ErrorNegocio } from '@/server/accion'
import { normalizarCedula, tramosAsistencia, jornadasDelDiaAsistencia, type TramoAsistencia } from '@/server/asistencia/cliente'
import { avisar, notificarUsuario, usuarioDeColaborador } from '@/server/notificaciones/avisar'
import { enviarPush } from '@/server/notificaciones/push'
import { textoResumenDia, textoJornadaDia } from '@/lib/asistencia/resumen-dia'
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

/**
 * Cron de cada noche (≈1:00 a. m.): la jornada del día que terminó, a cada
 * colaborador que marcó en AsistencIA, como notificación en su app (campana +
 * push). Reemplaza el correo diario que mandaba AsistencIA por Gmail.
 *
 * Se consulta AsistencIA por API (jornadas y horas extra del día) y se cruza por
 * cédula. Idempotente: la notificación lleva una clave por persona y día, así
 * que correrlo otra vez no la duplica (ni vuelve a mandar el push).
 */
/**
 * `solo`: manda solo a esa persona (cédula, o parte del nombre como sale en
 * AsistencIA), para probar con alguien sin avisarle a todos.
 */
export async function enviarJornadasDelDia(fechaISO: string, solo?: string): Promise<{
  fecha: string; jornadas: number; enviados: number; yaEnviados: number; sinUsuario: number; sinFicha: number
}> {
  const [jornadas, tramos, colaboradores] = await Promise.all([
    jornadasDelDiaAsistencia(fechaISO),
    tramosAsistencia({ desde: fechaISO, hasta: fechaISO }),
    prisma.colaborador.findMany({ where: { estado: 'ACTIVO' }, select: { id: true, numeroDocumento: true, usuarioId: true } }),
  ])
  const porCedula = new Map(colaboradores.map((c) => [normalizarCedula(c.numeroDocumento), c]))
  const resultado = { fecha: fechaISO, jornadas: jornadas.length, enviados: 0, yaEnviados: 0, sinUsuario: 0, sinFicha: 0 }

  for (const j of jornadas) {
    const cedula = normalizarCedula(j.documento)
    if (solo && cedula !== normalizarCedula(solo) && !j.nombre.toLowerCase().includes(solo.toLowerCase())) continue
    const colab = porCedula.get(cedula)
    if (!colab) { resultado.sinFicha++; continue }
    if (!colab.usuarioId) { resultado.sinUsuario++; continue }

    const dedupeKey = `asistencia_jornada:${colab.id}:${fechaISO}`
    if (await prisma.notificacion.findUnique({ where: { dedupeKey }, select: { id: true } })) { resultado.yaEnviados++; continue }

    const texto = textoJornadaDia(fechaISO, j, tramos.filter((t) => normalizarCedula(t.documento) === cedula))
    await notificarUsuario(colab.usuarioId, texto.titulo, texto.mensaje, '/autoservicio', dedupeKey, 'asistencia_resumen_dia', colab.id)
    await enviarPush(colab.usuarioId, { titulo: texto.titulo, mensaje: texto.mensaje, enlace: '/autoservicio' }).catch(() => {})
    resultado.enviados++
  }
  return resultado
}
