import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { esOps } from '@/lib/tramites-vinculo'
import { prisma } from '@/lib/db'
import { Prisma } from '@/generated/prisma/client'
import { saldoVacaciones } from '@/server/vacaciones'
import { liquidarVacaciones } from '@/server/vacaciones-liquidacion'
import { Card, CardContent } from '@/components/ui/card'
import { TreePalm, Clock, CreditCard } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtCOP } from '@/lib/moneda'
import { formatFechaCorta, formatFechaLarga, hoyBogota, parseFechaISO } from '@/lib/fechas'
import { defLicencia } from '@/lib/licencias'
import { PanelTramites } from './panel-tramites'
import { MisSolicitudes, type SolicitudItem } from './mis-solicitudes'

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
        <h1 className="mb-4 text-xl font-bold">Autoservicio</h1>
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          Tu usuario no está vinculado a una ficha de colaborador. Contacta a Talento Humano.
        </CardContent></Card>
      </div>
    )
  }

  const [colab, saldo, solicitudes, disciplinariosAbiertos, contratosPorFirmar, ultimoPago] = await Promise.all([
    prisma.colaborador.findUniqueOrThrow({ where: { id: usuario.colaboradorId }, select: { nombres: true, tipoVinculo: true, estado: true, direccion: true, emergenciaNombre: true, epsId: true, afpId: true, bancoId: true, numeroCuenta: true } }),
    saldoVacaciones(usuario.colaboradorId),
    prisma.solicitud.findMany({
      where: { colaboradorId: usuario.colaboradorId },
      include: { pasos: { orderBy: { orden: 'asc' } } },
      orderBy: { creadoEn: 'desc' },
      take: 20,
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
  ])

  // Documentos requeridos por su tipo de vínculo que aún no ha entregado.
  const [requeridos, entregados] = await Promise.all([
    prisma.documentoRequerido.findMany({ where: { tipoVinculo: colab.tipoVinculo, obligatorio: true }, select: { tipoDocumentoId: true } }),
    prisma.documento.findMany({
      where: { entidadTipo: 'Colaborador', entidadId: usuario.colaboradorId, tipoDocumentoId: { not: null } },
      select: { tipoDocumentoId: true },
    }),
  ])
  const tiposEntregados = new Set(entregados.map((d) => d.tipoDocumentoId))
  const documentosFaltantes = requeridos.filter((r) => !tiposEntregados.has(r.tipoDocumentoId)).length

  // Entregas pendientes de firma digital: dotación (arts. 230-234 CST),
  // actas de activos y recibidos de EPP (D.1072 art. 2.2.4.6.24).
  const [dotSinFirma, actasSinFirma, eppSinFirma] = await Promise.all([
    prisma.entregaDotacion.count({ where: { colaboradorId: usuario.colaboradorId, firmadoEn: null } }),
    prisma.asignacionActivo.count({ where: { colaboradorId: usuario.colaboradorId, fechaDevolucion: null, firmaEntregaEn: null } }),
    prisma.entregaEpp.count({ where: { colaboradorId: usuario.colaboradorId, firmadoEn: null } }),
  ])
  const dotacionPorFirmar = dotSinFirma + actasSinFirma + eppSinFirma

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

  const enTramite = solicitudes.filter((s) => s.estado === 'EN_APROBACION' || s.estado === 'PENDIENTE').length
  const devueltas = solicitudes.filter((s) => s.estado === 'DEVUELTA').length
  const primerNombre = colab.nombres.split(' ')[0]

  // El saludo dice lo único que exige acción hoy; si no hay nada, no inventa urgencia.
  const pendiente = devueltas > 0
    ? `tienes ${devueltas} solicitud${devueltas > 1 ? 'es' : ''} devuelta${devueltas > 1 ? 's' : ''} por corregir`
    : contratosPorFirmar > 0
      ? `tienes ${contratosPorFirmar} documento${contratosPorFirmar > 1 ? 's' : ''} por firmar`
      : enTramite > 0
        ? `tienes ${enTramite} solicitud${enTramite > 1 ? 'es' : ''} en trámite`
        : 'no tienes nada pendiente'

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
      },
    })
  }

  const base = { resultado: null, certId: null, advertencias: [], pasos: [], contrapropuesta: null, origen: ORIGEN_EMPRESA }
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
      },
    })
  }

  actividad.sort((a, b) => b.fecha.getTime() - a.fecha.getTime())
  const itemsActividad = actividad.slice(0, 20).map((a) => a.item)

  return (
    <div className="max-w-7xl">
      <h1 className="text-xl font-bold tracking-tight">Hola, {primerNombre}</h1>
      <p className="mt-0.5 text-[13px] text-muted-foreground">
        <span className="capitalize">{formatFechaLarga(hoyBogota())}</span> · {pendiente}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {/* El OPS no causa vacaciones: mostrarle "0 días disponibles" confunde más que omitirlo. */}
        {!esOps(colab.tipoVinculo) && (
          <Stat icono={TreePalm} color="bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" valor={String(saldo.saldo)} label="Días de vacaciones disponibles" />
        )}
        <Stat icono={Clock} color="bg-amber-500/12 text-amber-600 dark:text-amber-400" valor={String(enTramite)} label="Solicitudes en trámite" />
        <Stat
          icono={CreditCard} color="bg-foreground/8 text-foreground"
          valor={ultimoPago ? fmtCOP(Number(ultimoPago.neto)) : '—'}
          label={ultimoPago ? `Último pago · ${formatFechaCorta(ultimoPago.periodo.fechaFin)}` : 'Aún sin pagos liquidados'}
          className="col-span-2 sm:col-span-1"
        />
      </div>

      <PanelTramites
        activo={colab.estado === 'ACTIVO'}
        tipoVinculo={colab.tipoVinculo}
        fichaFaltantes={[colab.direccion, colab.emergenciaNombre, colab.epsId, colab.afpId, colab.bancoId, colab.numeroCuenta].filter((x) => !x).length}
        contratosPorFirmar={contratosPorFirmar}
        disciplinariosAbiertos={disciplinariosAbiertos}
        puedeAprobar={puedeAprobar}
        saldoVacaciones={saldo.saldo}
        documentosFaltantes={documentosFaltantes}
        dotacionPorFirmar={dotacionPorFirmar}
      />

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
