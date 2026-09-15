import 'server-only'
import { esOps } from '@/lib/tramites-vinculo'
import { prisma } from '@/lib/db'
import { hoyBogota } from '@/lib/fechas'
import { dias360 } from '@/server/nomina/liquidacion-definitiva'

/**
 * Saldo de vacaciones de un colaborador.
 * Causadas = (días desde que empezó el contrato de trabajo / 360) × 15 días hábiles
 *            + ajustes (saldo inicial, manuales).
 * Disfrutadas/pendientes = vacaciones APROBADAS/EN_DISFRUTE/DISFRUTADAS.
 */
export async function saldoVacaciones(colaboradorId: string, corte?: Date): Promise<{
  causadas: number
  disfrutadas: number
  pendientesAprobacion: number
  saldo: number
  /**
   * Días COMPLETOS disponibles: lo que ve el colaborador y Talento Humano.
   *
   * Las vacaciones se toman por días hábiles enteros, así que «1,60 días» no le
   * dice nada a nadie: se muestra 1. Se trunca (no se redondea) para no anunciar
   * un día que todavía no se ha causado.
   */
  saldoEntero: number
  /**
   * El saldo SIN redondear, para calcular dinero.
   *
   * `saldo` viene a dos decimales porque es lo que se usa en cálculos
   * intermedios; pagar sobre una cifra recortada infla la liquidación: en un
   * salario mínimo, redondear 8,1666 a 8,17 son casi $200 de más. Para
   * mostrar, `saldoEntero`; para liquidar, este.
   */
  saldoExacto: number
  /** Desde cuándo causa: inicio del contrato de trabajo (ver `inicioCausacion`). */
  desde: Date
}> {
  const colab = await prisma.colaborador.findUniqueOrThrow({
    where: { id: colaboradorId },
    select: { fechaIngreso: true, tipoVinculo: true },
  })

  // Un contrato de prestación de servicios no causa vacaciones: no hay relación
  // laboral. Se corta aquí, en la fuente, para que ninguna pantalla ni reporte
  // llegue a mostrarle días "disponibles" que no existen.
  if (esOps(colab.tipoVinculo)) {
    return { causadas: 0, disfrutadas: 0, pendientesAprobacion: 0, saldo: 0, saldoEntero: 0, saldoExacto: 0, desde: colab.fechaIngreso }
  }

  // Las vacaciones se causan mientras hay vínculo. Al liquidar a alguien hay que
  // cortar en su fecha de retiro: si se corta en hoy, se le siguen causando días
  // por un tiempo que ya no trabajó y la liquidación le paga de más.
  const hasta = corte ?? hoyBogota()
  const desde = await inicioCausacion(colaboradorId, colab.fechaIngreso, hasta)
  // Convención comercial 30/360, la misma con que se liquida todo lo demás
  // (cesantías, prima, indemnizaciones). Contar días calendario contra un año de
  // 360 mezclaba dos convenciones y causaba ~1,4% de días de más.
  const diasTrabajados = dias360(desde, hasta)
  const causadasBase = (diasTrabajados / 360) * 15

  const ajustes = await prisma.ajusteVacaciones.aggregate({
    where: { colaboradorId },
    _sum: { dias: true },
  })
  const causadas = causadasBase + Number(ajustes._sum.dias ?? 0)

  const disfrutadas = await prisma.vacaciones.aggregate({
    where: { colaboradorId, estado: { in: ['APROBADA', 'EN_DISFRUTE', 'DISFRUTADA'] } },
    _sum: { diasHabiles: true },
  })
  const pendientes = await prisma.vacaciones.aggregate({
    where: { colaboradorId, estado: 'SOLICITADA' },
    _sum: { diasHabiles: true },
  })

  const disfrutadasNum = Number(disfrutadas._sum.diasHabiles ?? 0)
  const pendientesNum = Number(pendientes._sum.diasHabiles ?? 0)
  const saldoExacto = causadas - disfrutadasNum

  return {
    causadas: redondear(causadas),
    disfrutadas: redondear(disfrutadasNum),
    pendientesAprobacion: redondear(pendientesNum),
    saldo: redondear(saldoExacto),
    // `|| 0` evita el «-0» de truncar un negativo pequeño.
    saldoEntero: Math.trunc(saldoExacto) || 0,
    saldoExacto,
    desde,
  }
}

/**
 * Desde cuándo causa vacaciones: el inicio del primer contrato de trabajo de la
 * relación laboral vigente.
 *
 * Solo el contrato de trabajo causa vacaciones (CST art. 186). Quien pasó de
 * prestación de servicios a laboral empieza a causar el día que empezó el
 * contrato laboral, no cuando entró como contratista; por eso no sirve la fecha
 * de ingreso de la ficha, que es la antigüedad en la empresa. Si ya hubo un
 * retiro, cuenta el primer contrato posterior: las vacaciones anteriores se
 * pagaron en esa liquidación. Sin contratos registrados (fichas importadas
 * antes de que existiera el módulo) se cae a la fecha de ingreso.
 */
async function inicioCausacion(colaboradorId: string, fechaIngreso: Date, hasta: Date): Promise<Date> {
  const retiro = await prisma.terminacion.findFirst({
    where: { colaboradorId, fechaRetiro: { lt: hasta } },
    orderBy: { fechaRetiro: 'desc' },
    select: { fechaRetiro: true },
  })
  const primero = await prisma.contrato.findFirst({
    where: { colaboradorId, ...(retiro ? { fechaInicio: { gt: retiro.fechaRetiro } } : {}) },
    orderBy: { fechaInicio: 'asc' },
    select: { fechaInicio: true },
  })
  return primero?.fechaInicio ?? fechaIngreso
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100
}
