import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { sedeActualId } from '@/server/sede-actual'
import { Encabezado } from '@/components/shell/encabezado'
import { NovedadesCliente } from './novedades-cliente'
import { formatFechaISO } from '@/lib/fechas'

export const metadata = { title: 'Novedades · Smart Gadgets RH' }

export default async function NovedadesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const usuario = await requerirPermiso('novedades', 'VER')
  const { tab = 'vacaciones' } = await searchParams
  const puedeCrear = tienePermiso(usuario, 'novedades', 'CREAR')
  const puedeEditar = tienePermiso(usuario, 'novedades', 'EDITAR')
  const sede = await sedeActualId()
  const filtroSede = sede ? { colaborador: { sedeId: sede } } : {}
  const incCol = { colaborador: { select: { nombres: true, apellidos: true, id: true } } }

  const [vacaciones, incapacidades, licencias, permisos, bonificaciones] = await Promise.all([
    prisma.vacaciones.findMany({ where: filtroSede, include: incCol, orderBy: { creadoEn: 'desc' }, take: 100 }),
    prisma.incapacidad.findMany({ where: filtroSede, include: incCol, orderBy: { creadoEn: 'desc' }, take: 100 }),
    prisma.licencia.findMany({ where: filtroSede, include: incCol, orderBy: { creadoEn: 'desc' }, take: 100 }),
    prisma.permiso.findMany({ where: filtroSede, include: incCol, orderBy: { creadoEn: 'desc' }, take: 100 }),
    prisma.bonificacion.findMany({ where: filtroSede, include: incCol, orderBy: { creadoEn: 'desc' }, take: 100 }),
  ])

  // Soportes adjuntos por el empleado en la solicitud de autoservicio que originó la novedad
  const solicitudIds = [...vacaciones, ...incapacidades, ...permisos].map((x) => x.solicitudId).filter((id): id is string => !!id)
  const docs = solicitudIds.length
    ? await prisma.documento.findMany({ where: { entidadTipo: 'Solicitud', entidadId: { in: solicitudIds } }, select: { id: true, entidadId: true } })
    : []
  const docPorSolicitud = new Map<string, string>()
  for (const d of docs) if (!docPorSolicitud.has(d.entidadId)) docPorSolicitud.set(d.entidadId, d.id)
  const soporte = (solId: string | null) => (solId ? docPorSolicitud.get(solId) ?? null : null)

  const nombre = (c: { nombres: string; apellidos: string }) => `${c.nombres} ${c.apellidos}`

  return (
    <div className="mx-auto max-w-5xl">
      <Encabezado titulo="Novedades" descripcion="Incapacidades, licencias, permisos, vacaciones y bonificaciones." />
      <NovedadesCliente
        tab={tab}
        puedeCrear={puedeCrear}
        puedeEditar={puedeEditar}
        datos={{
          vacaciones: vacaciones.map((x) => ({ id: x.id, colaborador: nombre(x.colaborador), colaboradorId: x.colaborador.id, fechaInicio: formatFechaISO(x.fechaInicio), fechaFin: formatFechaISO(x.fechaFin), dias: Number(x.diasHabiles), estado: x.estado, desdeAutoservicio: !!x.solicitudId, soporteDocId: soporte(x.solicitudId) })),
          incapacidades: incapacidades.map((x) => ({ id: x.id, colaborador: nombre(x.colaborador), tipo: x.tipo, fechaInicio: formatFechaISO(x.fechaInicio), fechaFin: formatFechaISO(x.fechaFin), dias: x.dias, desdeAutoservicio: !!x.solicitudId, soporteDocId: soporte(x.solicitudId) })),
          licencias: licencias.map((x) => ({ id: x.id, colaborador: nombre(x.colaborador), tipo: x.tipo, fechaInicio: formatFechaISO(x.fechaInicio), fechaFin: formatFechaISO(x.fechaFin), dias: x.dias, remunerada: x.remunerada })),
          permisos: permisos.map((x) => ({ id: x.id, colaborador: nombre(x.colaborador), fecha: formatFechaISO(x.fecha), diaCompleto: x.diaCompleto, horas: x.horas ? Number(x.horas) : null, motivo: x.motivo, desdeAutoservicio: !!x.solicitudId, soporteDocId: soporte(x.solicitudId) })),
          bonificaciones: bonificaciones.map((x) => ({ id: x.id, colaborador: nombre(x.colaborador), concepto: x.concepto, valor: Number(x.valor), constitutivoSalario: x.constitutivoSalario, estadoPago: x.estadoPago, fechaPago: x.fechaPago ? formatFechaISO(x.fechaPago) : null })),
        }}
      />
    </div>
  )
}
