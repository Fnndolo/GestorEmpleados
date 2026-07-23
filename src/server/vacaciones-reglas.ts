import 'server-only'
import { prisma } from '@/lib/db'
import { saldoVacaciones } from '@/server/vacaciones'
import { diasHabilesRango } from '@/app/(app)/novedades/acciones'

/**
 * Reglas de negocio de vacaciones según el Reglamento Interno de Trabajo (RIT)
 * de KUPOCELL S.A.S. — Capítulo 9 (arts. 33 a 42) y art. 69 num. 4.
 * Toda validación que se aplique aquí cita el artículo que la sustenta.
 */

/** Bloque mínimo de disfrute continuo al año — RIT art. 37 lit. a (y art. 190 CST). */
export const DIAS_BLOQUE_MINIMO = 6
/** Acumulación máxima general: 2 períodos (30 días hábiles) — RIT art. 37 lit. b. */
export const DIAS_ADVERTENCIA_ACUMULACION = 30
/** Preaviso mínimo cuando la empresa fija la época — RIT art. 34 (art. 187 CST).
 *  Regla de empresa: se cuenta en días HÁBILES (más favorable que el mínimo legal). */
export const DIAS_PREAVISO_EMPRESA = 15

/**
 * Fecha mínima de inicio para vacaciones fijadas por la empresa: hoy + 15 días
 * hábiles (RIT art. 34, contados en hábiles por decisión de empresa).
 */
export async function fechaMinimaPreaviso(): Promise<Date> {
  const { hoyBogota } = await import('@/lib/fechas')
  const { esDiaHabil } = await import('@/lib/dias-habiles')
  const { cargarFestivos } = await import('@/server/vencimientos/festivos')
  const hoy = hoyBogota()
  const empresa = await prisma.configuracionEmpresa.findFirst()
  const festivos = await cargarFestivos(hoy.getUTCFullYear(), hoy.getUTCFullYear() + 1)
  const fecha = new Date(hoy)
  let habiles = 0
  while (habiles < DIAS_PREAVISO_EMPRESA) {
    fecha.setUTCDate(fecha.getUTCDate() + 1)
    if (esDiaHabil(fecha, festivos, empresa?.sabadoHabil ?? true)) habiles++
  }
  return fecha
}

export type EvaluacionVacaciones = {
  /** Días hábiles del rango solicitado. */
  dias: number
  /** Saldo disponible (causadas − disfrutadas/aprobadas) al momento de evaluar. */
  saldo: number
  /** true si los días solicitados exceden el saldo causado (RIT art. 33). */
  anticipadas: boolean
  /** Cuántos días quedarían en negativo si se aprueba. */
  diasAnticipados: number
  /** Advertencias no bloqueantes para el aprobador, cada una con su artículo del RIT. */
  advertencias: string[]
}

/**
 * Evalúa una solicitud de vacaciones contra el RIT:
 *  - Marca si son causadas o anticipadas (art. 33: derecho tras un año completo).
 *  - Advierte si el bloque es menor a 6 días hábiles y el colaborador aún no ha
 *    disfrutado un bloque ≥ 6 en los últimos 12 meses (art. 37 lit. a).
 *  - Advierte si el saldo acumulado supera 2 períodos (art. 37 lit. b y c).
 */
export async function evaluarSolicitudVacaciones(
  colaboradorId: string,
  fechaInicio: string,
  fechaFin: string,
): Promise<EvaluacionVacaciones> {
  const dias = await diasHabilesRango(fechaInicio, fechaFin)
  const { saldo } = await saldoVacaciones(colaboradorId)

  const advertencias: string[] = []
  const anticipadas = dias > saldo
  const diasAnticipados = anticipadas ? Math.round((dias - saldo) * 100) / 100 : 0

  // Art. 37 lit. a: al menos un bloque de 6 días hábiles continuos al año.
  if (dias < DIAS_BLOQUE_MINIMO) {
    const hace12Meses = new Date()
    hace12Meses.setUTCFullYear(hace12Meses.getUTCFullYear() - 1)
    const bloqueCumplido = await prisma.vacaciones.findFirst({
      where: {
        colaboradorId,
        estado: { in: ['SOLICITADA', 'APROBADA', 'EN_DISFRUTE', 'DISFRUTADA'] },
        diasHabiles: { gte: DIAS_BLOQUE_MINIMO },
        fechaInicio: { gte: hace12Meses },
      },
    })
    if (!bloqueCumplido) {
      advertencias.push(
        `El colaborador debe disfrutar al menos un bloque de ${DIAS_BLOQUE_MINIMO} días hábiles continuos al año y aún no lo ha hecho en los últimos 12 meses (RIT art. 37 lit. a).`,
      )
    }
  }

  // Art. 37 lit. b y c: acumulación máxima de 2 años (4 para confianza/técnicos).
  if (saldo > DIAS_ADVERTENCIA_ACUMULACION) {
    advertencias.push(
      `El colaborador acumula ${saldo} días hábiles de vacaciones (más de 2 períodos). La acumulación superior a 2 años requiere acuerdo escrito, o hasta 4 años solo para personal de confianza, técnico o especializado (RIT art. 37 lit. b y c).`,
    )
  }

  return { dias, saldo, anticipadas, diasAnticipados, advertencias }
}
