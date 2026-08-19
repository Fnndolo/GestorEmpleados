import 'server-only'
import { esOps } from '@/lib/tramites-vinculo'
import { prisma } from '@/lib/db'
import { hoyBogota } from '@/lib/fechas'

/**
 * Saldo de vacaciones de un colaborador.
 * Causadas = (días desde ingreso / 360) × 15 días hábiles + ajustes (saldo inicial, manuales).
 * Disfrutadas/pendientes = vacaciones APROBADAS/EN_DISFRUTE/DISFRUTADAS.
 */
export async function saldoVacaciones(colaboradorId: string): Promise<{
  causadas: number
  disfrutadas: number
  pendientesAprobacion: number
  saldo: number
}> {
  const colab = await prisma.colaborador.findUniqueOrThrow({
    where: { id: colaboradorId },
    select: { fechaIngreso: true, tipoVinculo: true },
  })

  // Un contrato de prestación de servicios no causa vacaciones: no hay relación
  // laboral. Se corta aquí, en la fuente, para que ninguna pantalla ni reporte
  // llegue a mostrarle días "disponibles" que no existen.
  if (esOps(colab.tipoVinculo)) {
    return { causadas: 0, disfrutadas: 0, pendientesAprobacion: 0, saldo: 0 }
  }

  const hoy = hoyBogota()
  const diasTrabajados = Math.max(0, (hoy.getTime() - colab.fechaIngreso.getTime()) / 86_400_000)
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
  }
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100
}
