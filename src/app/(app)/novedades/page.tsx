import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { sedeActualId } from '@/server/sede-actual'
import { Encabezado } from '@/components/shell/encabezado'
import { NovedadesCliente } from './novedades-cliente'
import { formatFechaISO } from '@/lib/fechas'
import Link from 'next/link'
import { Inbox, ChevronRight } from 'lucide-react'

export const metadata = { title: 'Novedades · Smart Gadgets RH' }

export default async function NovedadesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const usuario = await requerirPermiso('novedades', 'VER')
  const { tab = 'vacaciones' } = await searchParams
  const puedeCrear = tienePermiso(usuario, 'novedades', 'CREAR')
  const puedeEditar = tienePermiso(usuario, 'novedades', 'EDITAR')
  const sede = await sedeActualId()
  const filtroSede = sede ? { colaborador: { sedeId: sede } } : {}
  const incCol = { colaborador: { select: { nombres: true, apellidos: true, id: true, fotoPath: true } } }

  // Acceso directo a la bandeja de aprobaciones para RRHH: la página vive en
  // /autoservicio/aprobaciones (los jefes llegan por Autoservicio), pero desde
  // aquí se muestra el conteo de solicitudes pendientes por resolver.
  const puedeAprobar = tienePermiso(usuario, 'autoservicio', 'APROBAR')
  const aprobacionesPendientes = puedeAprobar
    ? await prisma.solicitud.count({ where: { estado: 'EN_APROBACION', pasos: { some: { estado: 'PENDIENTE' } } } })
    : 0

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

      {puedeAprobar && (
        <Link
          href="/autoservicio/aprobaciones"
          className={
            aprobacionesPendientes > 0
              ? 'mb-4 flex items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-3 transition-colors hover:bg-amber-500/10'
              : 'mb-4 flex items-center gap-3 rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-accent/40'
          }
        >
          <span
            className={
              aprobacionesPendientes > 0
                ? 'grid size-9 shrink-0 place-items-center rounded-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-400'
                : 'grid size-9 shrink-0 place-items-center rounded-[10px] bg-violet-500/12 text-violet-600 dark:text-violet-400'
            }
          >
            <Inbox className="size-[19px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">
              {aprobacionesPendientes > 0
                ? `${aprobacionesPendientes} solicitud${aprobacionesPendientes === 1 ? '' : 'es'} de autoservicio por aprobar`
                : 'Bandeja de aprobaciones'}
            </span>
            <span className="block text-xs text-muted-foreground">
              {aprobacionesPendientes > 0
                ? 'Vacaciones, permisos, incapacidades y licencias esperando decisión.'
                : 'No hay solicitudes pendientes por resolver.'}
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      )}

      <NovedadesCliente
        tab={tab}
        puedeCrear={puedeCrear}
        puedeEditar={puedeEditar}
        datos={{
          vacaciones: vacaciones.map((x) => ({ id: x.id, colaborador: nombre(x.colaborador), colaboradorId: x.colaborador.id, tieneFoto: !!x.colaborador.fotoPath, fechaInicio: formatFechaISO(x.fechaInicio), fechaFin: formatFechaISO(x.fechaFin), dias: Number(x.diasHabiles), estado: x.estado, desdeAutoservicio: !!x.solicitudId, soporteDocId: soporte(x.solicitudId) })),
          incapacidades: incapacidades.map((x) => ({ id: x.id, colaborador: nombre(x.colaborador), colaboradorId: x.colaborador.id, tieneFoto: !!x.colaborador.fotoPath, tipo: x.tipo, fechaInicio: formatFechaISO(x.fechaInicio), fechaFin: formatFechaISO(x.fechaFin), dias: x.dias, desdeAutoservicio: !!x.solicitudId, soporteDocId: soporte(x.solicitudId) })),
          licencias: licencias.map((x) => ({ id: x.id, colaborador: nombre(x.colaborador), colaboradorId: x.colaborador.id, tieneFoto: !!x.colaborador.fotoPath, tipo: x.tipo, fechaInicio: formatFechaISO(x.fechaInicio), fechaFin: formatFechaISO(x.fechaFin), dias: x.dias, remunerada: x.remunerada })),
          permisos: permisos.map((x) => ({ id: x.id, colaborador: nombre(x.colaborador), colaboradorId: x.colaborador.id, tieneFoto: !!x.colaborador.fotoPath, fecha: formatFechaISO(x.fecha), diaCompleto: x.diaCompleto, horas: x.horas ? Number(x.horas) : null, motivo: x.motivo, desdeAutoservicio: !!x.solicitudId, soporteDocId: soporte(x.solicitudId) })),
          bonificaciones: bonificaciones.map((x) => ({ id: x.id, colaborador: nombre(x.colaborador), colaboradorId: x.colaborador.id, tieneFoto: !!x.colaborador.fotoPath, concepto: x.concepto, valor: Number(x.valor), constitutivoSalario: x.constitutivoSalario, estadoPago: x.estadoPago, fechaPago: x.fechaPago ? formatFechaISO(x.fechaPago) : null })),
        }}
      />
    </div>
  )
}
