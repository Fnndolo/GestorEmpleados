import 'server-only'
import { prisma } from '@/lib/db'
import { hoyBogota, parseFechaISO, formatFechaISO } from '@/lib/fechas'
import { restarDiasHabiles } from '@/lib/dias-habiles'
import { cargarFestivos } from '@/server/vencimientos/festivos'
import {
  DIAS_HABILES_POSTERIOR, LIMITE_HORAS_EXTRA_DIA, LIMITE_HORAS_EXTRA_SEMANA, semanaDe, type CalculoHorasExtra,
} from '@/lib/horas-extra-solicitud'

/**
 * Primer día que todavía se puede pedir "después": hoy menos 3 días hábiles.
 * Antes de eso ya no se autoriza desde autoservicio.
 */
export async function fechaMinimaHorasExtra(): Promise<Date> {
  const hoy = hoyBogota()
  const empresa = await prisma.configuracionEmpresa.findFirst({ select: { sabadoHabil: true } })
  const festivos = await cargarFestivos(hoy.getUTCFullYear() - 1, hoy.getUTCFullYear())
  return restarDiasHabiles(hoy, DIAS_HABILES_POSTERIOR, festivos, empresa?.sabadoHabil ?? true)
}

/**
 * Horas extra del día y de la semana (lunes a domingo) contando esta solicitud,
 * las ya autorizadas y las que siguen en aprobación. No bloquea: el aprobador
 * ve la alerta si se pasa de 2 al día o 12 a la semana (decisión de empresa).
 */
export async function calcularLimitesHorasExtra(colaboradorId: string, fechaISO: string, horas: number): Promise<CalculoHorasExtra> {
  const { desde, hasta } = semanaDe(fechaISO)
  const [autorizadas, enTramite] = await Promise.all([
    prisma.autorizacionHorasExtra.findMany({
      where: { colaboradorId, fecha: { gte: parseFechaISO(desde)!, lte: parseFechaISO(hasta)! } },
      select: { fecha: true, horas: true },
    }),
    prisma.solicitud.findMany({
      where: { colaboradorId, tipo: 'HORAS_EXTRA', estado: 'EN_APROBACION' },
      select: { datos: true },
    }),
  ])
  const filas = [
    ...autorizadas.map((a) => ({ fecha: formatFechaISO(a.fecha), horas: Number(a.horas) })),
    ...enTramite
      .map((s) => s.datos as { fechaInicio?: string; horas?: number })
      .filter((d) => d.fechaInicio && d.fechaInicio >= desde && d.fechaInicio <= hasta)
      .map((d) => ({ fecha: d.fechaInicio!, horas: Number(d.horas ?? 0) })),
  ]
  const redondear = (n: number) => Math.round(n * 10) / 10
  const totalDia = redondear(horas + filas.filter((f) => f.fecha === fechaISO).reduce((a, f) => a + f.horas, 0))
  const totalSemana = redondear(horas + filas.reduce((a, f) => a + f.horas, 0))
  return {
    horas, totalDia, totalSemana,
    excedeDia: totalDia > LIMITE_HORAS_EXTRA_DIA,
    excedeSemana: totalSemana > LIMITE_HORAS_EXTRA_SEMANA,
  }
}
