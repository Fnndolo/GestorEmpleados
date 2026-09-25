import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { sedeActualId } from '@/server/sede-actual'
import { Encabezado } from '@/components/shell/encabezado'
import { NovedadesCliente, BuscadorNovedades } from './novedades-cliente'
import { filtroBusquedaColaborador } from '@/server/consultas/colaboradores'
import { formatFechaISO, formatFechaCorta, hoyBogota } from '@/lib/fechas'
import { situacionComprobante } from '@/lib/comprobante-permiso'
import Link from 'next/link'
import { Inbox } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { urlFoto } from '@/lib/foto'

export const metadata = { title: 'Novedades · Smart Gadgets RH' }

export default async function NovedadesPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const usuario = await requerirPermiso('novedades', 'VER')
  const { tab = 'permisos', q = '' } = await searchParams
  const puedeCrear = tienePermiso(usuario, 'novedades', 'CREAR')
  const puedeEditar = tienePermiso(usuario, 'novedades', 'EDITAR')
  const sede = await sedeActualId()
  // Sede activa y, si se buscó a alguien, solo sus novedades (nombre, apellidos o documento).
  const filtroColab = { ...(sede ? { sedeId: sede } : {}), ...filtroBusquedaColaborador(q) }
  const filtroSede = Object.keys(filtroColab).length ? { colaborador: filtroColab } : {}
  const incCol = { colaborador: { select: { nombres: true, apellidos: true, id: true, fotoPath: true } } }

  // Acceso directo a la bandeja de aprobaciones para RRHH (icono junto al título):
  // la página vive en /autoservicio/aprobaciones (los jefes llegan por
  // Autoservicio), pero desde aquí se muestra el conteo de pendientes.
  const puedeAprobar = tienePermiso(usuario, 'autoservicio', 'APROBAR')
  const aprobacionesPendientes = puedeAprobar
    ? await prisma.solicitud.count({ where: { estado: 'EN_APROBACION', pasos: { some: { estado: 'PENDIENTE' } } } })
    : 0

  const [vacaciones, incapacidades, licencias, permisos, bonificaciones, horasExtra] = await Promise.all([
    prisma.vacaciones.findMany({ where: filtroSede, include: incCol, orderBy: { creadoEn: 'desc' }, take: 100 }),
    prisma.incapacidad.findMany({ where: filtroSede, include: incCol, orderBy: { creadoEn: 'desc' }, take: 100 }),
    prisma.licencia.findMany({ where: filtroSede, include: incCol, orderBy: { creadoEn: 'desc' }, take: 100 }),
    prisma.permiso.findMany({ where: filtroSede, include: incCol, orderBy: { creadoEn: 'desc' }, take: 100 }),
    prisma.bonificacion.findMany({ where: filtroSede, include: incCol, orderBy: { creadoEn: 'desc' }, take: 100 }),
    // Horas extra autorizadas desde autoservicio (la autorización, no el pago).
    prisma.autorizacionHorasExtra.findMany({ where: filtroSede, include: incCol, orderBy: { fecha: 'desc' }, take: 100 }),
  ])

  // Soportes adjuntos por el empleado en la solicitud de autoservicio que originó la novedad
  const solicitudIds = [...vacaciones, ...incapacidades, ...permisos, ...horasExtra].map((x) => x.solicitudId).filter((id): id is string => !!id)
  const docs = solicitudIds.length
    ? await prisma.documento.findMany({ where: { entidadTipo: 'Solicitud', entidadId: { in: solicitudIds } }, select: { id: true, entidadId: true } })
    : []
  const docPorSolicitud = new Map<string, string>()
  for (const d of docs) if (!docPorSolicitud.has(d.entidadId)) docPorSolicitud.set(d.entidadId, d.id)
  const soporte = (solId: string | null) => (solId ? docPorSolicitud.get(solId) ?? null : null)

  // Comprobantes de asistencia subidos por el colaborador (entidadTipo "Permiso"): el más reciente de cada permiso.
  const docsComprobante = permisos.length
    ? await prisma.documento.findMany({
        where: { entidadTipo: 'Permiso', entidadId: { in: permisos.map((p) => p.id) } },
        orderBy: { creadoEn: 'desc' },
        select: { id: true, entidadId: true },
      })
    : []
  const comprobantePorPermiso = new Map<string, string>()
  for (const d of docsComprobante) if (!comprobantePorPermiso.has(d.entidadId)) comprobantePorPermiso.set(d.entidadId, d.id)
  const hoy = hoyBogota()

  const nombre = (c: { nombres: string; apellidos: string }) => `${c.nombres} ${c.apellidos}`

  return (
    <div className="max-w-7xl">
      <Encabezado
        titulo="Novedades"
        volver
        centro={<BuscadorNovedades tab={tab} busqueda={q} />}
        centroEnLinea
        acciones={puedeAprobar && (
          // Bandeja de aprobaciones como icono, con el conteo encima (como la campana):
          // la tarjeta con texto ocupaba una fila entera aunque no hubiera nada pendiente.
          <Button asChild variant="outline" size="icon" className="relative">
            <Link
              href="/autoservicio/aprobaciones"
              title={aprobacionesPendientes > 0 ? `${aprobacionesPendientes} por aprobar` : 'Bandeja de aprobaciones'}
              aria-label={aprobacionesPendientes > 0 ? `Bandeja de aprobaciones: ${aprobacionesPendientes} por aprobar` : 'Bandeja de aprobaciones'}
            >
              <Inbox className="size-5" />
              {aprobacionesPendientes > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-white">
                  {aprobacionesPendientes > 9 ? '9+' : aprobacionesPendientes}
                </span>
              )}
            </Link>
          </Button>
        )}
      />

      <NovedadesCliente
        tab={tab}
        busqueda={q}
        puedeCrear={puedeCrear}
        puedeEditar={puedeEditar}
        datos={{
          vacaciones: vacaciones.map((x) => ({ id: x.id, colaborador: nombre(x.colaborador), colaboradorId: x.colaborador.id, fotoUrl: urlFoto(x.colaborador.id, x.colaborador.fotoPath, true), fechaInicio: formatFechaISO(x.fechaInicio), fechaFin: formatFechaISO(x.fechaFin), dias: Number(x.diasHabiles), estado: x.estado, desdeAutoservicio: !!x.solicitudId, soporteDocId: soporte(x.solicitudId) })),
          incapacidades: incapacidades.map((x) => ({ id: x.id, colaborador: nombre(x.colaborador), colaboradorId: x.colaborador.id, fotoUrl: urlFoto(x.colaborador.id, x.colaborador.fotoPath, true), tipo: x.tipo, fechaInicio: formatFechaISO(x.fechaInicio), fechaFin: formatFechaISO(x.fechaFin), dias: x.dias, desdeAutoservicio: !!x.solicitudId, soporteDocId: soporte(x.solicitudId) })),
          licencias: licencias.map((x) => ({ id: x.id, colaborador: nombre(x.colaborador), colaboradorId: x.colaborador.id, fotoUrl: urlFoto(x.colaborador.id, x.colaborador.fotoPath, true), tipo: x.tipo, fechaInicio: formatFechaISO(x.fechaInicio), fechaFin: formatFechaISO(x.fechaFin), dias: x.dias, remunerada: x.remunerada })),
          permisos: permisos.map((x) => ({
            id: x.id, colaborador: nombre(x.colaborador), colaboradorId: x.colaborador.id, fotoUrl: urlFoto(x.colaborador.id, x.colaborador.fotoPath, true),
            fecha: formatFechaISO(x.fecha), diaCompleto: x.diaCompleto, horas: x.horas ? Number(x.horas) : null, motivo: x.motivo,
            desdeAutoservicio: !!x.solicitudId, soporteDocId: soporte(x.solicitudId),
            comprobante: {
              situacion: situacionComprobante(x.comprobanteEstado, x.comprobanteVence, hoy),
              vence: x.comprobanteVence ? formatFechaCorta(x.comprobanteVence) : null,
              entregadoEn: x.comprobanteEntregadoEn ? formatFechaCorta(x.comprobanteEntregadoEn) : null,
              nota: x.comprobanteNota,
              docId: comprobantePorPermiso.get(x.id) ?? null,
            },
          })),
          horasExtra: horasExtra.map((x) => ({
            id: x.id, colaborador: nombre(x.colaborador), colaboradorId: x.colaborador.id, fotoUrl: urlFoto(x.colaborador.id, x.colaborador.fotoPath, true),
            fecha: formatFechaISO(x.fecha), horaInicio: x.horaInicio, horaFin: x.horaFin, horas: Number(x.horas),
            motivo: x.motivo, posterior: x.posterior, soporteDocId: soporte(x.solicitudId),
          })),
          bonificaciones: bonificaciones.map((x) => ({ id: x.id, colaborador: nombre(x.colaborador), colaboradorId: x.colaborador.id, fotoUrl: urlFoto(x.colaborador.id, x.colaborador.fotoPath, true), concepto: x.concepto, valor: Number(x.valor), constitutivoSalario: x.constitutivoSalario, estadoPago: x.estadoPago, fechaPago: x.fechaPago ? formatFechaISO(x.fechaPago) : null })),
        }}
      />
    </div>
  )
}
