import 'server-only'
import { prisma } from '@/lib/db'
import { hoyBogota, formatFechaISO } from '@/lib/fechas'
import { fmtCOP } from '@/lib/moneda'
import { notificarUsuario } from '@/server/notificaciones/avisar'

/**
 * Liquidación del pago de vacaciones — RIT art. 42:
 * "Durante las vacaciones, el trabajador recibirá el salario ordinario que devengue
 *  al momento de iniciar el disfrute. No se incluirán valores por horas extras,
 *  recargos ni trabajo en días de descanso. Si el salario es variable, se tomará el
 *  promedio del último año laborado como base para la liquidación."
 */
export type LiquidacionVacaciones = {
  salarioBase: number
  promedioVariable: number
  baseLiquidacion: number
  valorDia: number
  dias: number
  total: number
}

export async function liquidarVacaciones(colaboradorId: string, diasHabiles: number): Promise<LiquidacionVacaciones | null> {
  const contrato = await prisma.contrato.findFirst({
    where: { colaboradorId, estado: 'ACTIVO' },
    orderBy: { fechaInicio: 'desc' },
  })
  if (!contrato) return null

  // Salario variable (comisiones): promedio del último año — RIT art. 42.
  const hace1Ano = hoyBogota()
  hace1Ano.setUTCFullYear(hace1Ano.getUTCFullYear() - 1)
  const comisiones = await prisma.comision.aggregate({
    where: { colaboradorId, creadoEn: { gte: hace1Ano } },
    _avg: { valor: true },
  })

  const salarioBase = Number(contrato.salarioBase)
  const promedioVariable = Math.round(Number(comisiones._avg.valor ?? 0))
  const baseLiquidacion = salarioBase + promedioVariable
  const valorDia = Math.round(baseLiquidacion / 30)
  const total = Math.round(valorDia * diasHabiles)

  return { salarioBase, promedioVariable, baseLiquidacion, valorDia, dias: diasHabiles, total }
}

/** Desglose en HTML para el correo de aprobación (se inserta en la plantilla de avisos). */
export function desgloseHtml(liq: LiquidacionVacaciones, fechaInicio: string, fechaFin: string): string {
  const fila = (c: string, v: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#64748b">${c}</td><td style="padding:4px 0;text-align:right"><strong>${v}</strong></td></tr>`
  return `
    Tus vacaciones del <strong>${fechaInicio}</strong> al <strong>${fechaFin}</strong> fueron aprobadas.
    Este es el desglose del pago (RIT art. 42: salario ordinario, sin horas extras ni recargos):
    <table style="margin-top:8px;border-collapse:collapse;font-size:14px">
      ${fila('Salario base', fmtCOP(liq.salarioBase))}
      ${liq.promedioVariable > 0 ? fila('Promedio variable (último año)', fmtCOP(liq.promedioVariable)) : ''}
      ${fila('Base de liquidación', fmtCOP(liq.baseLiquidacion))}
      ${fila('Valor día (base ÷ 30)', fmtCOP(liq.valorDia))}
      ${fila('Días hábiles de disfrute', String(liq.dias))}
      ${fila('Total a pagar', fmtCOP(liq.total))}
    </table>
    El pago se procesa con la nómina antes de tu fecha de salida.`
}

/**
 * Transición automática de estados (cron diario):
 *  APROBADA → EN_DISFRUTE cuando llega la fecha de inicio, y
 *  APROBADA/EN_DISFRUTE → DISFRUTADA cuando pasa la fecha de fin.
 * Alimenta el registro especial de vacaciones del RIT art. 35 (fechas reales de
 * inicio y fin del disfrute) sin intervención manual.
 */
export async function actualizarEstadosVacaciones(): Promise<{ enDisfrute: number; disfrutadas: number }> {
  const hoy = hoyBogota()

  // Terminadas primero, para no marcar EN_DISFRUTE algo que ya acabó.
  const terminadas = await prisma.vacaciones.updateMany({
    where: { estado: { in: ['APROBADA', 'EN_DISFRUTE'] }, fechaFin: { lt: hoy } },
    data: { estado: 'DISFRUTADA' },
  })

  const porIniciar = await prisma.vacaciones.findMany({
    where: { estado: 'APROBADA', fechaInicio: { lte: hoy }, fechaFin: { gte: hoy } },
    include: { colaborador: { select: { usuarioId: true } } },
  })
  for (const v of porIniciar) {
    await prisma.vacaciones.update({ where: { id: v.id }, data: { estado: 'EN_DISFRUTE' } })
    if (v.colaborador.usuarioId) {
      await notificarUsuario(
        v.colaborador.usuarioId,
        '¡Empiezan tus vacaciones!',
        `Hoy inicia tu descanso hasta el ${formatFechaISO(v.fechaFin)}. Disfrútalo — tu derecho a la desconexión laboral está garantizado (RIT art. 19 num. 6).`,
        '/autoservicio',
        `vacaciones-inicio:${v.id}`,
        'vacaciones_inicio',
      )
    }
  }

  return { enDisfrute: porIniciar.length, disfrutadas: terminadas.count }
}
