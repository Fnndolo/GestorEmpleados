import 'server-only'
import { prisma } from '@/lib/db'

export type EventoDia = { dia: number; tipo: string; etiqueta: string }

const LIC_LABEL: Record<string, string> = {
  MATERNIDAD: 'Lic. maternidad', PATERNIDAD: 'Lic. paternidad', LUTO: 'Luto', CALAMIDAD: 'Calamidad',
  MATRIMONIO: 'Matrimonio', ESTUDIO: 'Estudio', NO_REMUNERADA: 'Lic. no remunerada',
  DIA_DE_LA_FAMILIA: 'Día de la familia', DIA_COMPENSATORIO_VOTACION: 'Día compensatorio', OTRA: 'Licencia',
}

/** Días de cada evento del colaborador dentro de un mes (anio, mes 1-12). */
export async function eventosDelMes(colaboradorId: string, anio: number, mes: number): Promise<EventoDia[]> {
  const inicioMes = new Date(Date.UTC(anio, mes - 1, 1))
  const finMes = new Date(Date.UTC(anio, mes, 0)) // último día del mes
  const diasEnMes = finMes.getUTCDate()

  const enRango = { fechaInicio: { lte: finMes }, fechaFin: { gte: inicioMes } }
  const [vacaciones, licencias, incapacidades, permisos, suspensiones] = await Promise.all([
    prisma.vacaciones.findMany({ where: { colaboradorId, estado: { in: ['APROBADA', 'EN_DISFRUTE', 'DISFRUTADA'] }, ...enRango } }),
    prisma.licencia.findMany({ where: { colaboradorId, ...enRango } }),
    prisma.incapacidad.findMany({ where: { colaboradorId, ...enRango } }),
    prisma.permiso.findMany({ where: { colaboradorId, fecha: { gte: inicioMes, lte: finMes } } }),
    prisma.suspensionContrato.findMany({ where: { contrato: { colaboradorId }, fechaInicio: { lte: finMes }, OR: [{ fechaFin: null }, { fechaFin: { gte: inicioMes } }] } }),
  ])

  const eventos: EventoDia[] = []
  const expandir = (desde: Date, hasta: Date | null, tipo: string, etiqueta: string) => {
    const ini = desde < inicioMes ? inicioMes : desde
    const fin = !hasta || hasta > finMes ? finMes : hasta
    for (let d = ini.getUTCDate(); d <= (fin.getUTCMonth() === mes - 1 ? fin.getUTCDate() : diasEnMes); d++) {
      eventos.push({ dia: d, tipo, etiqueta })
    }
  }

  for (const v of vacaciones) expandir(v.fechaInicio, v.fechaFin, 'vacaciones', 'Vacaciones')
  for (const l of licencias) {
    const tipo = l.tipo === 'DIA_DE_LA_FAMILIA' ? 'dia_familia' : l.tipo === 'DIA_COMPENSATORIO_VOTACION' ? 'compensatorio' : 'licencia'
    expandir(l.fechaInicio, l.fechaFin, tipo, LIC_LABEL[l.tipo] ?? 'Licencia')
  }
  for (const i of incapacidades) expandir(i.fechaInicio, i.fechaFin, 'incapacidad', 'Incapacidad')
  for (const s of suspensiones) expandir(s.fechaInicio, s.fechaFin, 'suspension', 'Suspensión')
  for (const p of permisos) eventos.push({ dia: p.fecha.getUTCDate(), tipo: 'permiso', etiqueta: p.motivo || 'Permiso' })

  return eventos
}
