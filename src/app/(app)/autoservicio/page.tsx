import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { esOps } from '@/lib/tramites-vinculo'
import { prisma } from '@/lib/db'
import { documentosFaltantesDe } from '@/server/expediente'
import { Prisma } from '@/generated/prisma/client'
import { saldoVacaciones } from '@/server/vacaciones'
import { saldoVisibleEnAutoservicio } from '@/lib/vacaciones-config'
import { liquidarVacaciones } from '@/server/vacaciones-liquidacion'
import { Card, CardContent } from '@/components/ui/card'
import { CalendarRange, Clock, CreditCard } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtCOP } from '@/lib/moneda'
import { formatFechaCorta, formatFechaLarga, formatFechaISO, hoyBogota, parseFechaISO } from '@/lib/fechas'
import { defLicencia } from '@/lib/licencias'
import { situacionComprobante } from '@/lib/comprobante-permiso'
import { comprobanteVencidoDe } from '@/server/comprobante-permiso'
import { fechaBreve } from '@/lib/notificaciones/texto'
import { PanelTramites } from './panel-tramites'
import { BannerAvisos } from '@/components/avisos/banner-avisos'
import { avisosParaUsuario, hrefsNuevos } from '@/server/avisos'
import { CumpleanosACargo, type CumpleanosACargoItem } from './cumpleanos-a-mi-cargo'
import { MisSolicitudes, type SolicitudItem, type ComprobanteItem } from './mis-solicitudes'
import { Encabezado } from '@/components/shell/encabezado'

export const metadata = { title: 'Autoservicio · Smart Gadgets RH' }

const TIPO_SOL: Record<string, string> = { VACACIONES: 'Vacaciones', PERMISO: 'Permiso', INCAPACIDAD: 'Incapacidad', CERTIFICACION_LABORAL: 'Certificación laboral', LICENCIA: 'Licencia', OTRA: 'Otra' }
const ESTADO_SOL: Record<string, string> = { PENDIENTE: 'Pendiente', EN_APROBACION: 'En aprobación', EN_NEGOCIACION: 'Contrapropuesta', DEVUELTA: 'Devuelta', APROBADA: 'Aprobada', RECHAZADA: 'Rechazada', CANCELADA: 'Cancelada' }

const TIPO_INCAP: Record<string, string> = {
  ENFERMEDAD_GENERAL: 'Enfermedad general', ACCIDENTE_TRABAJO: 'Accidente de trabajo',
  ENFERMEDAD_LABORAL: 'Enfermedad laboral', LICENCIA_MATERNIDAD: 'Lic. maternidad', LICENCIA_PATERNIDAD: 'Lic. paternidad',
}

const TIPO_CERT: Record<string, string> = {
  SIMPLE: 'Simple (cargo y fechas)', CON_SALARIO: 'Con salario', CON_FUNCIONES: 'Con funciones', ENTIDAD_FINANCIERA: 'Para entidad financiera',
}

// Novedades registradas por la empresa (tablas de novedad, no solicitudes)
const ESTADO_VAC: Record<string, string> = {
  SOLICITADA: 'Solicitada', APROBADA: 'Aprobada', EN_DISFRUTE: 'En disfrute', DISFRUTADA: 'Disfrutada', RECHAZADA: 'Rechazada', CANCELADA: 'Cancelada',
}
const TIPO_LIC_NOV: Record<string, string> = {
  MATERNIDAD: 'maternidad', PATERNIDAD: 'paternidad', LUTO: 'luto', CALAMIDAD: 'calamidad', MATRIMONIO: 'matrimonio',
  ESTUDIO: 'estudio', NO_REMUNERADA: 'no remunerada', DIA_DE_LA_FAMILIA: 'día de la familia',
  DIA_COMPENSATORIO_VOTACION: 'día compensatorio (votación)', OTRA: 'otra',
}
const ORIGEN_EMPRESA = 'Programada por la empresa'

/** "yyyy-mm-dd" → "12 ago 2026" (si no parsea, devuelve el original). */
function fechaLegible(iso?: string): string {
  if (!iso) return '—'
  const d = parseFechaISO(iso)
  return d ? formatFechaCorta(d) : iso
}

type LiqVac = { salarioBase: number; promedioVariable: number; baseLiquidacion: number; valorDia: number; dias: number; total: number }

/** Filas de la sección "Liquidación del pago (RIT art. 42)", formateadas en COP. */
function liquidacionFilas(liq: LiqVac): { filas: { label: string; valor: string }[]; total: string } {
  return {
    filas: [
      { label: 'Salario base', valor: fmtCOP(liq.salarioBase) },
      ...(liq.promedioVariable > 0 ? [{ label: 'Promedio variable', valor: fmtCOP(liq.promedioVariable) }] : []),
      { label: 'Base de liquidación', valor: fmtCOP(liq.baseLiquidacion) },
      { label: 'Valor día', valor: fmtCOP(liq.valorDia) },
      { label: 'Días hábiles', valor: String(liq.dias) },
    ],
    total: fmtCOP(liq.total),
  }
}

/** Pares etiqueta → valor del detalle expandido, según el tipo de solicitud. */
function camposSolicitud(tipo: string, datos: Record<string, unknown>): { label: string; valor: string }[] {
  const d = datos as Record<string, string | undefined>
  // Vacaciones: solo lo esencial para el colaborador — fechas; el trámite y el
  // resultado se muestran aparte. El detalle de cálculo lo ve el aprobador.
  if (tipo === 'VACACIONES') return [
    { label: 'Desde', valor: fechaLegible(d.fechaInicio) },
    { label: 'Hasta', valor: fechaLegible(d.fechaFin) },
  ]
  if (tipo === 'PERMISO') return [
    { label: 'Fecha', valor: fechaLegible(d.fechaInicio) },
    { label: 'Modalidad', valor: d.permisoTipo === 'HORAS' && d.horaInicio ? `Por horas · ${d.horaInicio}–${d.horaFin}` : 'Día completo' },
    ...(d.motivo ? [{ label: 'Motivo', valor: d.motivo }] : []),
  ]
  if (tipo === 'INCAPACIDAD') return [
    { label: 'Tipo', valor: TIPO_INCAP[d.incapacidadTipo ?? ''] ?? 'Incapacidad' },
    { label: 'Desde', valor: fechaLegible(d.fechaInicio) },
    { label: 'Hasta', valor: fechaLegible(d.fechaFin) },
    ...(d.entidad ? [{ label: 'Entidad', valor: d.entidad }] : []),
    ...(d.motivo ? [{ label: 'Observaciones', valor: d.motivo }] : []),
  ]
  if (tipo === 'LICENCIA') {
    const def = d.licenciaTipo ? defLicencia(d.licenciaTipo) : null
    return [
      ...(def ? [{ label: 'Tipo', valor: def.label }] : []),
      { label: 'Desde', valor: fechaLegible(d.fechaInicio) },
      { label: 'Hasta', valor: fechaLegible(d.fechaFin) },
      ...(def ? [{ label: 'Remunerada', valor: def.remunerada ? 'Sí' : 'No' }] : []),
      ...(d.motivo ? [{ label: 'Motivo', valor: d.motivo }] : []),
    ]
  }
  if (tipo === 'CERTIFICACION_LABORAL') return [
    { label: 'Tipo', valor: TIPO_CERT[d.tipoCertificacion ?? ''] ?? d.tipoCertificacion ?? 'Simple' },
    ...(d.dirigidaA ? [{ label: 'Dirigida a', valor: d.dirigidaA }] : []),
  ]
  return []
}

export default async function AutoservicioPage() {
  const usuario = await requerirPermiso('autoservicio', 'VER')
  const puedeAprobar = tienePermiso(usuario, 'autoservicio', 'APROBAR')

  if (!usuario.colaboradorId) {
    return (
      <div className="max-w-7xl">
        <Encabezado volver titulo="Autoservicio" />
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          Tu usuario no está vinculado a una ficha de colaborador. Contacta a Talento Humano.
        </CardContent></Card>
      </div>
    )
  }

  const [colab, saldo, solicitudes, disciplinariosAbiertos, opsPorFirmar, ultimoPago, otrosisPorFirmar, horasExtraPorFirmar] = await Promise.all([
    prisma.colaborador.findUniqueOrThrow({ where: { id: usuario.colaboradorId }, select: { nombres: true, tipoVinculo: true, estado: true, vacacionesHistorialCompletoEn: true, fechaNacimiento: true, direccion: true, emergenciaNombre: true, epsId: true, afpId: true, bancoId: true, numeroCuenta: true } }),
    saldoVacaciones(usuario.colaboradorId),
    prisma.solicitud.findMany({
      where: { colaboradorId: usuario.colaboradorId },
      include: { pasos: { orderBy: { orden: 'asc' } } },
      orderBy: { creadoEn: 'desc' },
      take: 40,
    }),
    prisma.procesoDisciplinario.count({ where: { colaboradorId: usuario.colaboradorId, cerrado: false } }),
    prisma.contratoOps.count({
      where: { colaboradorId: usuario.colaboradorId, firmaContratistaPath: null, contenidoPdf: { not: Prisma.DbNull }, estado: { in: ['BORRADOR', 'ACTIVO'] } },
    }),
    prisma.liquidacionNomina.findFirst({
      where: { colaboradorId: usuario.colaboradorId },
      include: { periodo: { select: { fechaFin: true } } },
      orderBy: { periodo: { fechaFin: 'desc' } },
    }),
    // Otrosíes de sus contratos laborales que aún debe firmar en la app.
    prisma.otrosiContrato.count({
      where: { contrato: { colaboradorId: usuario.colaboradorId }, requiereFirma: true, firmaEmpleadoPath: null },
    }),
    // Órdenes de pago de horas extra (aparte de la nómina) esperando su firma.
    prisma.pagoHorasExtra.count({
      where: { colaboradorId: usuario.colaboradorId, estado: 'ENVIADA_A_FIRMA' },
    }),
  ])
  // Documentos por firmar: contratos OPS y otrosíes (la tarjeta los muestra juntos).
  const contratosPorFirmar = opsPorFirmar + otrosisPorFirmar

  // Documentos obligatorios (por vínculo y por cargo) que aún no ha entregado.
  const documentosFaltantes = (await documentosFaltantesDe(usuario.colaboradorId)).length

  // Entregas pendientes de firma digital: dotación (arts. 230-234 CST),
  // actas de activos y recibidos de EPP (D.1072 art. 2.2.4.6.24).
  const [dotSinFirma, actasSinFirma, eppSinFirma] = await Promise.all([
    prisma.entregaDotacion.count({ where: { colaboradorId: usuario.colaboradorId, firmadoEn: null } }),
    prisma.asignacionActivo.count({ where: { colaboradorId: usuario.colaboradorId, fechaDevolucion: null, firmaEntregaEn: null } }),
    prisma.entregaEpp.count({ where: { colaboradorId: usuario.colaboradorId, firmadoEn: null } }),
  ])
  const dotacionPorFirmar = dotSinFirma + actasSinFirma + eppSinFirma

  // Cumpleaños que Talento Humano le encargó organizar: los abiertos y los
  // cerrados hace poco (para que vea que sus facturas se aceptaron).
  const hace30 = new Date(); hace30.setUTCDate(hace30.getUTCDate() - 30)
  const celebraciones = await prisma.celebracionCumpleanos.findMany({
    where: { encargadoId: usuario.colaboradorId, OR: [{ estado: { not: 'CERRADA' } }, { cerradaEn: { gte: hace30 } }] },
    include: { colaborador: { select: { nombres: true, apellidos: true } } },
    orderBy: { fecha: 'asc' },
  })
  const facturasCumple = celebraciones.length === 0 ? [] : await prisma.documento.findMany({
    where: { entidadTipo: 'CelebracionCumpleanos', entidadId: { in: celebraciones.map((c) => c.id) } },
    select: { id: true, entidadId: true, nombre: true, mimeType: true },
    orderBy: { creadoEn: 'asc' },
  })
  const cumpleanosACargo: CumpleanosACargoItem[] = celebraciones.map((c) => ({
    id: c.id,
    homenajeado: `${c.colaborador.nombres} ${c.colaborador.apellidos}`,
    fecha: formatFechaLarga(c.fecha),
    esHoy: formatFechaISO(c.fecha) === formatFechaISO(hoyBogota()),
    estado: c.estado,
    nota: c.nota,
    motivoDevolucion: c.motivoDevolucion,
    valorReportado: c.valorReportado != null ? Number(c.valorReportado) : null,
    facturas: facturasCumple.filter((f) => f.entidadId === c.id).map(({ id, nombre, mimeType }) => ({ id, nombre, mimeType })),
  }))

  // Novedades registradas directamente por la empresa (sin solicitud del colaborador):
  // deben verse aquí, no solo en la notificación de la campana.
  const propio = { colaboradorId: usuario.colaboradorId, solicitudId: null }
  const [vacEmpresa, licEmpresa, incEmpresa, perEmpresa] = await Promise.all([
    prisma.vacaciones.findMany({ where: propio, orderBy: { creadoEn: 'desc' }, take: 10 }),
    prisma.licencia.findMany({ where: propio, orderBy: { creadoEn: 'desc' }, take: 10 }),
    prisma.incapacidad.findMany({ where: propio, orderBy: { creadoEn: 'desc' }, take: 10 }),
    prisma.permiso.findMany({ where: propio, orderBy: { creadoEn: 'desc' }, take: 10 }),
  ])
  // Desglose del pago (RIT art. 42) de las vacaciones programadas por la empresa.
  const liqVacEmpresa = await Promise.all(
    vacEmpresa.map((x) => liquidarVacaciones(usuario.colaboradorId!, Number(x.diasHabiles))),
  )

  // Comprobante de asistencia de los permisos —los que nacieron de una solicitud
  // propia y los que registró la empresa—: situación, plazo y último archivo subido.
  const permisosDeSolicitud = await prisma.permiso.findMany({
    where: { colaboradorId: usuario.colaboradorId, solicitudId: { in: solicitudes.map((s) => s.id) } },
  })
  const todosLosPermisos = [...permisosDeSolicitud, ...perEmpresa]
  const docsComprobante = todosLosPermisos.length
    ? await prisma.documento.findMany({
        where: { entidadTipo: 'Permiso', entidadId: { in: todosLosPermisos.map((p) => p.id) } },
        orderBy: { creadoEn: 'desc' },
        select: { id: true, entidadId: true },
      })
    : []
  const docComprobantePorPermiso = new Map<string, string>()
  for (const d of docsComprobante) if (!docComprobantePorPermiso.has(d.entidadId)) docComprobantePorPermiso.set(d.entidadId, d.id)
  const permisoPorSolicitud = new Map(permisosDeSolicitud.map((p) => [p.solicitudId!, p]))

  // Soportes que el colaborador adjuntó a sus solicitudes (cita, incapacidad, licencia…).
  const docsSolicitud = solicitudes.length
    ? await prisma.documento.findMany({
        where: { entidadTipo: 'Solicitud', entidadId: { in: solicitudes.map((s) => s.id) } },
        orderBy: { creadoEn: 'asc' },
        select: { id: true, entidadId: true, nombre: true, mimeType: true },
      })
    : []
  const soportesPorSolicitud = new Map<string, { id: string; nombre: string; esImagen: boolean }[]>()
  for (const d of docsSolicitud) {
    const lista = soportesPorSolicitud.get(d.entidadId) ?? []
    lista.push({ id: d.id, nombre: d.nombre.replace(/^Soporte solicitud — /, ''), esImagen: d.mimeType.startsWith('image/') })
    soportesPorSolicitud.set(d.entidadId, lista)
  }
  const hoy = hoyBogota()
  const comprobanteDe = (p: (typeof todosLosPermisos)[number]): ComprobanteItem | null => {
    if (p.comprobanteEstado === 'NO_REQUERIDO') return null
    return {
      permisoId: p.id,
      situacion: situacionComprobante(p.comprobanteEstado, p.comprobanteVence, hoy),
      vence: p.comprobanteVence ? formatFechaCorta(p.comprobanteVence) : null,
      nota: p.comprobanteNota,
      docId: docComprobantePorPermiso.get(p.id) ?? null,
    }
  }

  const enTramite = solicitudes.filter((s) => s.estado === 'EN_APROBACION' || s.estado === 'PENDIENTE').length

  // ── Mi actividad: solicitudes propias + novedades registradas por la empresa ──
  const actividad: { fecha: Date; item: SolicitudItem }[] = []

  for (const s of solicitudes) {
    const certId = s.resultado?.startsWith('Certificación generada:') ? s.resultado.split(':')[1] : null
    const datos = s.datos as Record<string, unknown>
    // La licencia se nombra por su tipo ("Licencia de luto"), no como "Licencia" a secas.
    const licTipo = s.tipo === 'LICENCIA' ? (datos as { licenciaTipo?: string })?.licenciaTipo : null
    const etiqueta = licTipo ? `Licencia de ${defLicencia(licTipo).label.toLowerCase()}` : TIPO_SOL[s.tipo]
    const liq = s.tipo === 'VACACIONES'
      ? (datos.liquidacionVacaciones as { salarioBase: number; promedioVariable: number; baseLiquidacion: number; valorDia: number; dias: number; total: number } | undefined)
      : undefined
    const cp = s.estado === 'EN_NEGOCIACION'
      ? (datos.contrapropuesta as { fechaInicio: string; fechaFin: string; comentario?: string | null } | undefined)
      : undefined
    actividad.push({
      fecha: s.creadoEn,
      item: {
        id: s.id,
        tipo: s.tipo,
        estado: s.estado,
        estadoEtiqueta: ESTADO_SOL[s.estado] ?? s.estado,
        etiqueta,
        creadoEn: formatFechaCorta(s.creadoEn),
        resultado: s.resultado,
        certId,
        campos: camposSolicitud(s.tipo, datos),
        advertencias: [],
        pasos: s.pasos.map((p) => ({
          rol: p.usaJefeInmediato ? 'Jefe inmediato' : p.rolAprobador ?? 'Aprobador',
          estado: p.estado,
          comentario: p.comentario,
          decididoEn: p.decididoEn ? formatFechaCorta(p.decididoEn) : null,
        })),
        liquidacion: liq ? liquidacionFilas(liq) : null,
        contrapropuesta: cp
          ? { fechaInicio: fechaLegible(cp.fechaInicio), fechaFin: fechaLegible(cp.fechaFin), comentario: cp.comentario ?? null }
          : null,
        comprobante: s.tipo === 'PERMISO' && permisoPorSolicitud.has(s.id) ? comprobanteDe(permisoPorSolicitud.get(s.id)!) : null,
        soportes: soportesPorSolicitud.get(s.id) ?? [],
        // Un permiso se puede corregir mientras siga en aprobación y nadie lo haya decidido.
        edicion: s.tipo === 'PERMISO' && s.estado === 'EN_APROBACION' && s.pasos.every((p) => p.estado === 'PENDIENTE')
          ? {
              solicitudId: s.id,
              fechaInicio: String(datos.fechaInicio ?? ''),
              permisoTipo: datos.permisoTipo === 'HORAS' ? 'HORAS' as const : 'DIA' as const,
              horaInicio: typeof datos.horaInicio === 'string' ? datos.horaInicio : undefined,
              horaFin: typeof datos.horaFin === 'string' ? datos.horaFin : undefined,
              motivo: typeof datos.motivo === 'string' ? datos.motivo : '',
            }
          : null,
      },
    })
  }

  const base = { resultado: null, certId: null, advertencias: [], pasos: [], contrapropuesta: null, comprobante: null, origen: ORIGEN_EMPRESA }
  vacEmpresa.forEach((x, i) => {
    const liq = liqVacEmpresa[i]
    actividad.push({
      fecha: x.creadoEn,
      item: {
        ...base,
        id: x.id, tipo: 'VACACIONES', estado: x.estado,
        estadoEtiqueta: ESTADO_VAC[x.estado] ?? x.estado,
        etiqueta: 'Vacaciones',
        creadoEn: formatFechaCorta(x.creadoEn),
        campos: [
          { label: 'Desde', valor: formatFechaCorta(x.fechaInicio) },
          { label: 'Hasta', valor: formatFechaCorta(x.fechaFin) },
          { label: 'Días hábiles', valor: String(Number(x.diasHabiles)) },
          ...(x.observaciones ? [{ label: 'Observaciones', valor: x.observaciones }] : []),
        ],
        liquidacion: liq ? liquidacionFilas(liq) : null,
      },
    })
  })
  for (const x of licEmpresa) {
    actividad.push({
      fecha: x.creadoEn,
      item: {
        ...base,
        id: x.id, tipo: 'LICENCIA', estado: 'REGISTRADA', estadoEtiqueta: 'Registrada',
        etiqueta: `Licencia de ${TIPO_LIC_NOV[x.tipo] ?? x.tipo.toLowerCase()}`,
        creadoEn: formatFechaCorta(x.creadoEn),
        campos: [
          { label: 'Desde', valor: formatFechaCorta(x.fechaInicio) },
          { label: 'Hasta', valor: formatFechaCorta(x.fechaFin) },
          { label: 'Días', valor: String(x.dias) },
          { label: 'Remunerada', valor: x.remunerada ? 'Sí' : 'No' },
          ...(x.observaciones ? [{ label: 'Observaciones', valor: x.observaciones }] : []),
        ],
        liquidacion: null,
      },
    })
  }
  for (const x of incEmpresa) {
    actividad.push({
      fecha: x.creadoEn,
      item: {
        ...base,
        id: x.id, tipo: 'INCAPACIDAD', estado: 'REGISTRADA', estadoEtiqueta: 'Registrada',
        etiqueta: 'Incapacidad',
        creadoEn: formatFechaCorta(x.creadoEn),
        campos: [
          { label: 'Tipo', valor: TIPO_INCAP[x.tipo] ?? x.tipo },
          { label: 'Desde', valor: formatFechaCorta(x.fechaInicio) },
          { label: 'Hasta', valor: formatFechaCorta(x.fechaFin) },
          { label: 'Días', valor: String(x.dias) },
          ...(x.entidad ? [{ label: 'Entidad', valor: x.entidad }] : []),
        ],
        liquidacion: null,
      },
    })
  }
  for (const x of perEmpresa) {
    actividad.push({
      fecha: x.creadoEn,
      item: {
        ...base,
        id: x.id, tipo: 'PERMISO', estado: 'REGISTRADA', estadoEtiqueta: 'Registrado',
        etiqueta: 'Permiso',
        creadoEn: formatFechaCorta(x.creadoEn),
        campos: [
          { label: 'Fecha', valor: formatFechaCorta(x.fecha) },
          { label: 'Modalidad', valor: x.diaCompleto ? 'Día completo' : `Por horas (${Number(x.horas ?? 0)})` },
          ...(x.motivo ? [{ label: 'Motivo', valor: x.motivo }] : []),
          { label: 'Remunerado', valor: x.remunerado ? 'Sí' : 'No' },
        ],
        liquidacion: null,
        comprobante: comprobanteDe(x),
      },
    })
  }

  actividad.sort((a, b) => b.fecha.getTime() - a.fecha.getTime())
  // A la vista, lo de la última semana y lo que sigue abierto; lo demás queda
  // detrás de "Ver más" para que la lista no crezca sin fin.
  const hace7dias = hoy.getTime() - 7 * 86_400_000
  const abierta = (i: SolicitudItem) =>
    ['EN_APROBACION', 'EN_NEGOCIACION', 'DEVUELTA', 'PENDIENTE', 'SOLICITADA'].includes(i.estado) ||
    i.comprobante?.situacion === 'PENDIENTE' || i.comprobante?.situacion === 'VENCIDO'
  const itemsActividad = actividad.slice(0, 40).map((a) => ({ ...a.item, reciente: a.fecha.getTime() >= hace7dias || abierta(a.item) }))

  // Avisos de la plataforma que le tocan y no ha leído: el banner de arriba y
  // el punto de "nuevo" en la casilla del módulo al que apuntan.
  // Comprobante de un permiso vencido sin entregar: no puede pedir otro hasta subirlo.
  const debeComprobante = await comprobanteVencidoDe(usuario.colaboradorId)
  // Su saldo solo se le muestra cuando Talento Humano ya cargó su historial de vacaciones.
  const mostrarSaldo = saldoVisibleEnAutoservicio(colab.vacacionesHistorialCompletoEn)
  const avisos = await avisosParaUsuario(usuario)
  const avisosNuevos = avisos.filter((a) => a.vigente && !a.leido)

  return (
    <div className="max-w-7xl">
      <BannerAvisos avisos={avisosNuevos.slice(0, 5).map((a) => ({ id: a.id, titulo: a.titulo, resumen: a.resumen, tipo: a.tipo, enlace: a.enlace }))} />
      {/* Etiquetas de una palabra: con "Días de vacaciones disponibles" el texto
          se partía en tres renglones y estiraba los recuadros de más. La cifra
          grande y el ícono ya dicen de qué se trata. */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {/* El OPS no causa vacaciones: mostrarle "0 días disponibles" confunde más que omitirlo.
            Hasta que Talento Humano confirme que cargó su historial, el saldo calculado no es
            confiable: mismo recuadro, pero con "—" en vez del número (vacaciones-config.ts).
            En negativo son días que tomó anticipados y aún no ha causado. */}
        {!esOps(colab.tipoVinculo) && (
          <Stat
            icono={CalendarRange}
            color="bg-foreground text-background"
            valor={mostrarSaldo ? `${saldo.saldoEntero} día${Math.abs(saldo.saldoEntero) === 1 ? "" : "s"}` : "—"}
            label={mostrarSaldo && saldo.saldoEntero < 0 ? "Vacaciones anticipadas" : "Vacaciones"}
          />
        )}
        <Stat icono={Clock} color="bg-foreground text-background" valor={String(enTramite)} label="En trámite" />
        {/* El último pago solo merece recuadro cuando hay algo que mostrar. Sin
            pagos, un recuadro vacío con una raya pesa más de lo que informa: se
            deja como una línea centrada. */}
        {ultimoPago ? (
          <Stat
            icono={CreditCard} color="bg-foreground text-background"
            valor={fmtCOP(Number(ultimoPago.neto))}
            label={`Último pago · ${formatFechaCorta(ultimoPago.periodo.fechaFin)}`}
            className="col-span-2 sm:col-span-1"
          />
        ) : (
          <p className="col-span-2 flex items-center justify-center gap-2 py-2 text-[13px] text-muted-foreground sm:col-span-1">
            <CreditCard className="size-4 shrink-0" />
            Aún sin pagos liquidados
          </p>
        )}
      </div>

      <PanelTramites
        activo={colab.estado === 'ACTIVO'}
        tipoVinculo={colab.tipoVinculo}
        // La fecha de nacimiento cuenta: de ella sale la lista de cumpleaños.
        fichaFaltantes={[colab.fechaNacimiento, colab.direccion, colab.emergenciaNombre, colab.epsId, colab.afpId, colab.bancoId, colab.numeroCuenta].filter((x) => !x).length}
        contratosPorFirmar={contratosPorFirmar}
        disciplinariosAbiertos={disciplinariosAbiertos}
        puedeAprobar={puedeAprobar}
        saldoVacaciones={saldo.saldoEntero}
        mostrarSaldoVacaciones={mostrarSaldo}
        bloqueoPermiso={debeComprobante ? { fecha: fechaBreve(debeComprobante.fecha), vence: fechaBreve(debeComprobante.vence) } : null}
        documentosFaltantes={documentosFaltantes}
        horasExtraPorFirmar={horasExtraPorFirmar}
        dotacionPorFirmar={dotacionPorFirmar}
        hrefsNuevos={hrefsNuevos(avisos)}
      />

      {cumpleanosACargo.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2.5 text-[13px] font-bold">Cumpleaños a mi cargo</h2>
          <CumpleanosACargo items={cumpleanosACargo} />
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-2.5 text-[13px] font-bold">Mi actividad reciente</h2>
        {itemsActividad.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Aún no tienes solicitudes ni novedades.</CardContent></Card>
        ) : (
          <MisSolicitudes solicitudes={itemsActividad} />
        )}
      </section>
    </div>
  )
}

function Stat({ icono: Icono, color, valor, label, className }: {
  icono: React.ElementType; color: string; valor: string; label: string; className?: string
}) {
  return (
    <div className={cn('flex items-center gap-3 rounded-xl border bg-card p-3.5', className)}>
      <span className={cn('grid size-9 shrink-0 place-items-center rounded-[10px]', color)}>
        <Icono className="size-[19px]" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[22px] font-bold leading-none tracking-tight tabular-nums">{valor}</p>
        <p className="mt-1 text-[11.5px] text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}
