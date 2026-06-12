import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { Users, HeartPulse, AlertTriangle, ShieldCheck } from 'lucide-react'
import { hoyBogota, formatFechaISO } from '@/lib/fechas'
import { SstCliente } from './sst-cliente'

export const metadata = { title: 'SST · Smart Gadgets RH' }

export default async function SstPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const usuario = await requerirPermiso('sst', 'VER')
  const { tab = 'tablero' } = await searchParams
  const puedeCrear = tienePermiso(usuario, 'sst', 'CREAR')
  const puedeEditar = tienePermiso(usuario, 'sst', 'EDITAR')
  const anio = hoyBogota().getUTCFullYear()
  const hoy = hoyBogota()
  const en30 = new Date(hoy); en30.setUTCDate(en30.getUTCDate() + 30)

  const [headcount, examenesPorVencer, accidentesAnio, autoeval, comites, examenes, accidentes, epps, entregasEpp, peligros] = await Promise.all([
    prisma.colaborador.count({ where: { estado: 'ACTIVO' } }),
    prisma.examenMedico.count({ where: { fechaVencimiento: { gte: hoy, lte: en30 } } }),
    prisma.accidenteTrabajo.count({ where: { fecha: { gte: new Date(Date.UTC(anio, 0, 1)) } } }),
    prisma.autoevaluacionSst.findFirst({ orderBy: { anio: 'desc' } }),
    prisma.comite.findMany({ where: { activo: true }, orderBy: { creadoEn: 'desc' } }),
    prisma.examenMedico.findMany({ include: { colaborador: { select: { nombres: true, apellidos: true } } }, orderBy: { fecha: 'desc' }, take: 80 }),
    prisma.accidenteTrabajo.findMany({ include: { colaborador: { select: { nombres: true, apellidos: true } } }, orderBy: { fecha: 'desc' }, take: 80 }),
    prisma.elementoEpp.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }),
    prisma.entregaEpp.findMany({ include: { elementoEpp: true, colaborador: { select: { nombres: true, apellidos: true } } }, orderBy: { fechaEntrega: 'desc' }, take: 60 }),
    prisma.peligroIpevr.findMany({ orderBy: { creadoEn: 'desc' }, take: 80 }),
  ])

  const verSalud = tienePermiso(usuario, 'colaboradores_salud', 'VER')

  return (
    <div className="mx-auto max-w-5xl">
      <Encabezado titulo="Seguridad y Salud en el Trabajo" descripcion="SG-SST conforme al Decreto 1072/2015 y la Resolución 0312/2019." />

      {/* Tablero */}
      <div className="grid gap-3 sm:grid-cols-4 mb-6">
        <Indicador icono={Users} valor={headcount} label="Trabajadores activos" color="text-foreground" />
        <Indicador icono={HeartPulse} valor={examenesPorVencer} label="Exámenes por vencer" color="text-amber-500" />
        <Indicador icono={AlertTriangle} valor={accidentesAnio} label={`Accidentes ${anio}`} color="text-destructive" />
        <Indicador icono={ShieldCheck} valor={autoeval ? `${Number(autoeval.puntaje)}%` : '—'} label="Autoevaluación" color="text-emerald-600" />
      </div>

      <SstCliente
        tab={tab}
        puedeCrear={puedeCrear}
        puedeEditar={puedeEditar}
        verSalud={verSalud}
        headcount={headcount}
        comites={comites.map((c) => ({ id: c.id, tipo: c.tipo, vigenciaHasta: formatFechaISO(c.vigenciaHasta) }))}
        examenes={examenes.map((e) => ({ id: e.id, colaborador: `${e.colaborador.nombres} ${e.colaborador.apellidos}`, tipo: e.tipo, fecha: formatFechaISO(e.fecha), concepto: e.concepto, vencimiento: e.fechaVencimiento ? formatFechaISO(e.fechaVencimiento) : null }))}
        accidentes={accidentes.map((a) => ({ id: a.id, colaborador: `${a.colaborador.nombres} ${a.colaborador.apellidos}`, fecha: formatFechaISO(a.fecha), descripcion: a.descripcion, estado: a.estado, furat: a.furatReportado }))}
        epps={epps.map((e) => ({ id: e.id, nombre: e.nombre }))}
        entregasEpp={entregasEpp.map((e) => ({ id: e.id, colaborador: `${e.colaborador.nombres} ${e.colaborador.apellidos}`, elemento: e.elementoEpp.nombre, cantidad: e.cantidad, fecha: formatFechaISO(e.fechaEntrega) }))}
        peligros={peligros.map((p) => ({ id: p.id, proceso: p.proceso, peligro: p.peligro, nivel: p.nivel }))}
        autoeval={autoeval ? { anio: autoeval.anio, puntaje: Number(autoeval.puntaje), nivelEstandar: autoeval.nivelEstandar, planMejora: autoeval.planMejora } : null}
      />
    </div>
  )
}

function Indicador({ icono: Icono, valor, label, color }: { icono: typeof Users; valor: number | string; label: string; color: string }) {
  return (
    <Card><CardContent className="flex items-center gap-3 py-4">
      <Icono className={`size-6 ${color}`} />
      <div><p className="text-2xl font-semibold tabular-nums">{valor}</p><p className="text-xs text-muted-foreground">{label}</p></div>
    </CardContent></Card>
  )
}
