import 'server-only'
import { prisma } from '@/lib/db'
import { anotarPagadas, conexionAsistencia } from '@/server/asistencia/cliente'

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
