import 'server-only'
import { prisma } from '@/lib/db'
import { festivosDeRango } from '@/lib/dias-habiles'

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
  for (const p of permisos) {
    const horas = !p.diaCompleto && p.horaInicio ? ` ${p.horaInicio}–${p.horaFin ?? ''}`.trimEnd() : ''
    eventos.push({ dia: p.fecha.getUTCDate(), tipo: 'permiso', etiqueta: `${p.motivo || 'Permiso'}${horas}` })
  }

  return eventos
}

export type EventoAnio = { mes: number; dia: number; tipo: string; etiqueta: string }

/** Eventos del colaborador para todo un año (una sola query por fuente). */
export async function eventosDelAnio(colaboradorId: string, anio: number): Promise<EventoAnio[]> {
  const inicioAnio = new Date(Date.UTC(anio, 0, 1))
  const finAnio = new Date(Date.UTC(anio, 11, 31))

  const enRango = { fechaInicio: { lte: finAnio }, fechaFin: { gte: inicioAnio } }
  const [vacaciones, licencias, incapacidades, permisos, suspensiones, contratos] = await Promise.all([
    prisma.vacaciones.findMany({ where: { colaboradorId, estado: { in: ['APROBADA', 'EN_DISFRUTE', 'DISFRUTADA'] }, ...enRango } }),
    prisma.licencia.findMany({ where: { colaboradorId, ...enRango } }),
    prisma.incapacidad.findMany({ where: { colaboradorId, ...enRango } }),
    prisma.permiso.findMany({ where: { colaboradorId, fecha: { gte: inicioAnio, lte: finAnio } } }),
    prisma.suspensionContrato.findMany({ where: { contrato: { colaboradorId }, fechaInicio: { lte: finAnio }, OR: [{ fechaFin: null }, { fechaFin: { gte: inicioAnio } }] } }),
    prisma.contrato.findMany({ where: { colaboradorId, fechaFin: { gte: inicioAnio, lte: finAnio } }, select: { fechaFin: true, numero: true } }),
  ])

  const eventos: EventoAnio[] = []
  // Expande un rango [desde, hasta] en eventos por día, acotado al año.
  const expandir = (desde: Date, hasta: Date | null, tipo: string, etiqueta: string) => {
    const ini = desde < inicioAnio ? inicioAnio : desde
    const fin = !hasta || hasta > finAnio ? finAnio : hasta
    const d = new Date(Date.UTC(ini.getUTCFullYear(), ini.getUTCMonth(), ini.getUTCDate()))
    while (d <= fin) {
      eventos.push({ mes: d.getUTCMonth() + 1, dia: d.getUTCDate(), tipo, etiqueta })
      d.setUTCDate(d.getUTCDate() + 1)
    }
  }

  for (const v of vacaciones) expandir(v.fechaInicio, v.fechaFin, 'vacaciones', 'Vacaciones')
  for (const l of licencias) {
    const tipo = l.tipo === 'DIA_DE_LA_FAMILIA' ? 'dia_familia' : l.tipo === 'DIA_COMPENSATORIO_VOTACION' ? 'compensatorio' : 'licencia'
    expandir(l.fechaInicio, l.fechaFin, tipo, LIC_LABEL[l.tipo] ?? 'Licencia')
  }
  for (const i of incapacidades) expandir(i.fechaInicio, i.fechaFin, 'incapacidad', 'Incapacidad')
  for (const s of suspensiones) expandir(s.fechaInicio, s.fechaFin, 'suspension', 'Suspensión')
  for (const p of permisos) {
    const horas = !p.diaCompleto && p.horaInicio ? ` ${p.horaInicio}–${p.horaFin ?? ''}`.trimEnd() : ''
    eventos.push({ mes: p.fecha.getUTCMonth() + 1, dia: p.fecha.getUTCDate(), tipo: 'permiso', etiqueta: `${p.motivo || 'Permiso'}${horas}` })
  }

  // Festivos nacionales (Ley 51/Emiliani) — contexto común a todos.
  const festivos = festivosDeRango(anio, anio)
  for (const iso of festivos) {
    if (!iso.startsWith(String(anio))) continue
    eventos.push({ mes: Number(iso.slice(5, 7)), dia: Number(iso.slice(8, 10)), tipo: 'festivo', etiqueta: 'Festivo' })
  }

  // Fin de contrato(s) laborales que vencen dentro del año.
  for (const c of contratos) {
    if (!c.fechaFin) continue
    eventos.push({ mes: c.fechaFin.getUTCMonth() + 1, dia: c.fechaFin.getUTCDate(), tipo: 'fin_contrato', etiqueta: `Fin de contrato ${c.numero}` })
  }

  return eventos
}
