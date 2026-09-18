import 'server-only'
import { prisma } from '@/lib/db'
import { anotarPagadas, cerrarEnAsistencia, conexionAsistencia, normalizarCedula } from '@/server/asistencia/cliente'

/**
 * Al cerrar un periodo de nómina, AsistencIA se entera de qué tramos de horas
 * extra quedaron pagados (y al reabrirlo, de que ya no): así allá dejan de
 * salir como pendientes y nadie los paga dos veces.
 *
 * Es de mejor esfuerzo: el periodo se cierra igual aunque AsistencIA no
 * responda. Lo que no se pudo anotar se devuelve como aviso para que la
 * persona lo sepa; con la próxima anotación (idempotente) se corrige.
 */
export async function anotarPagoPeriodoEnAsistencia(
  periodoId: string,
  pagado: boolean,
): Promise<{ anotados: number; omitido?: boolean; error?: string }> {
  if (!(await conexionAsistencia())) return { anotados: 0, omitido: true }
  const filas = await prisma.novedadHoras.findMany({
    where: { periodoId, referenciaExterna: { not: null } },
    select: { referenciaExterna: true },
  })
  const referencias = [...new Set(filas.map((f) => f.referenciaExterna!))]
  if (referencias.length === 0) return { anotados: 0 }
  try {
    const r = await anotarPagadas(referencias, pagado)
    return { anotados: r.afectados }
  } catch (e) {
    console.error('No se pudo anotar el pago en AsistencIA:', e)
    return { anotados: 0, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Al firmar la orden de pago aparte, se cierra en AsistencIA el período de
 * ESA persona: allá queda congelado y marcado como pagado, así nadie corrige
 * una marcación después de firmado ni lo vuelve a pagar. Idempotente (si ya
 * estaba cerrado, AsistencIA lo dice y no es error). De mejor esfuerzo: la
 * firma vale igual; si AsistencIA no respondió se devuelve el error para
 * avisar y se reintenta al marcar el pago.
 */
export async function cerrarPagoPersonaEnAsistencia(
  pago: { colaboradorId: string; desde: Date; hasta: Date },
): Promise<{ cerrado: boolean; omitido?: boolean; error?: string }> {
  if (!(await conexionAsistencia())) return { cerrado: false, omitido: true }
  const colab = await prisma.colaborador.findUniqueOrThrow({ where: { id: pago.colaboradorId }, select: { numeroDocumento: true } })
  const cedula = normalizarCedula(colab.numeroDocumento)
  const periodo = { desde: pago.desde.toISOString().slice(0, 10), hasta: pago.hasta.toISOString().slice(0, 10) }
  try {
    const r = await cerrarEnAsistencia(periodo, [cedula])
    if (r.cerrados.includes(cedula) || r.yaCerrados.includes(cedula)) return { cerrado: true }
    if (r.sinExtras.includes(cedula)) return { cerrado: false, error: `La cédula ${cedula} no existe en AsistencIA.` }
    return { cerrado: false, error: 'AsistencIA no confirmó el cierre.' }
  } catch (e) {
    console.error('No se pudo cerrar el período en AsistencIA:', e)
    return { cerrado: false, error: e instanceof Error ? e.message : String(e) }
  }
}
