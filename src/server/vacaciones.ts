import 'server-only'
import { esOps } from '@/lib/tramites-vinculo'
import { prisma } from '@/lib/db'
import { hoyBogota } from '@/lib/fechas'
import { dias360 } from '@/server/nomina/liquidacion-definitiva'

/**
 * Saldo de vacaciones de un colaborador.
 * Causadas = (días desde ingreso / 360) × 15 días hábiles + ajustes (saldo inicial, manuales).
 * Disfrutadas/pendientes = vacaciones APROBADAS/EN_DISFRUTE/DISFRUTADAS.
 */
export async function saldoVacaciones(colaboradorId: string, corte?: Date): Promise<{
  causadas: number
  disfrutadas: number
  pendientesAprobacion: number
  saldo: number
  /**
   * El saldo SIN redondear, para calcular dinero.
   *
   * `saldo` viene a dos decimales porque es lo que se muestra en pantalla —«8,17
   * días» se lee mejor que «8,166667»—, pero pagar sobre esa cifra recortada
   * infla la liquidación: en un salario mínimo, redondear 8,1666 a 8,17 son casi
   * $200 de más. Para mostrar, `saldo`; para liquidar, este.
   */
  saldoExacto: number
}> {
  const colab = await prisma.colaborador.findUniqueOrThrow({
    where: { id: colaboradorId },
    select: { fechaIngreso: true, tipoVinculo: true },
  })

  // Un contrato de prestación de servicios no causa vacaciones: no hay relación
  // laboral. Se corta aquí, en la fuente, para que ninguna pantalla ni reporte
  // llegue a mostrarle días "disponibles" que no existen.
  if (esOps(colab.tipoVinculo)) {
    return { causadas: 0, disfrutadas: 0, pendientesAprobacion: 0, saldo: 0, saldoExacto: 0 }
  }

  // Las vacaciones se causan mientras hay vínculo. Al liquidar a alguien hay que
  // cortar en su fecha de retiro: si se corta en hoy, se le siguen causando días
  // por un tiempo que ya no trabajó y la liquidación le paga de más.
  const hasta = corte ?? hoyBogota()
  // Convención comercial 30/360, la misma con que se liquida todo lo demás
  // (cesantías, prima, indemnizaciones). Contar días calendario contra un año de
  // 360 mezclaba dos convenciones y causaba ~1,4% de días de más.
  const diasTrabajados = dias360(colab.fechaIngreso, hasta)
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

  return {
    causadas: redondear(causadas),
    disfrutadas: redondear(disfrutadasNum),
    pendientesAprobacion: redondear(pendientesNum),
    saldo: redondear(causadas - disfrutadasNum),
    saldoExacto: causadas - disfrutadasNum,
  }
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100
}
