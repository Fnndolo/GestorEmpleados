import { Fragment } from 'react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { UserRound } from 'lucide-react'
import { formatFechaCorta } from '@/lib/fechas'
import { AccionesLiquidacion } from './acciones-liquidacion'
import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Button } from '@/components/ui/button'
import { Pill } from '@/components/ui-kit'
import { formatFechaLarga, formatFechaISO, hoyBogotaISO } from '@/lib/fechas'
import { GestorDocumentos } from '@/components/documentos/gestor-documentos'
import { fmtCOP } from '@/lib/moneda'
import { leerDetalleLiquidacion } from '@/lib/terminaciones/liquidacion-filas'
import { mesesParaPromedios } from '@/server/nomina/bases-liquidacion'
import { PazYSalvoChecklist } from './paz-y-salvo'
import { DocumentoFirma, type EstadoDocumento } from './documento-firma'
import { PagoLiquidacion } from './pago-liquidacion'
import { CierreTerminacion } from './cierre'
import { RutaTerminacion, type PasoRuta } from './ruta'
import { ResumenLiquidacion } from './resumen-liquidacion'
import { ExamenEgreso } from './examen-egreso'
import { SeguridadSocial } from './seguridad-social'
import { CARTA_PRINCIPAL, NOMBRE_CARTA } from '@/lib/terminaciones/cartas'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { buttonVariants } from '@/components/ui/button'
import { FileText } from 'lucide-react'

export const metadata = { title: 'Terminación · Smart Gadgets RH' }

const TIPO: Record<string, string> = {
  RENUNCIA_VOLUNTARIA: 'Renuncia voluntaria', SIN_JUSTA_CAUSA: 'Sin justa causa', CON_JUSTA_CAUSA: 'Con justa causa',
  TERMINACION_ANTICIPADA: 'Terminación anticipada', MUTUO_ACUERDO: 'Mutuo acuerdo', VENCIMIENTO_PLAZO: 'Vencimiento del plazo',
  PERIODO_PRUEBA: 'Periodo de prueba', FIN_OPS: 'Fin OPS',
}

const ESTADO: Record<string, { texto: string; tone: 'ok' | 'warn' | 'info' }> = {
  EN_PROCESO: { texto: 'En proceso', tone: 'warn' },
  LIQUIDADA: { texto: 'Liquidada', tone: 'info' },
  CERRADA: { texto: 'Cerrada', tone: 'ok' },
}

const fecha = (d: Date | null | undefined) => (d ? formatFechaLarga(d) : null)

/**
 * Una terminación como ruta de pasos: registro, carta, paz y salvo, examen de
 * egreso, liquidación, seguridad social, soportes y cierre. Cada paso dice en qué va; los que llevan firma se firman
 * aquí (Talento Humano) y en el autoservicio del trabajador.
 */
export default async function TerminacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const usuario = await requerirPermiso('terminaciones', 'VER')
  const puedeEditar = tienePermiso(usuario, 'terminaciones', 'EDITAR')
  const puedeAprobar = tienePermiso(usuario, 'terminaciones', 'APROBAR')
  const puedeEliminar = tienePermiso(usuario, 'terminaciones', 'ELIMINAR')

  const t = await prisma.terminacion.findUnique({
    where: { id },
    include: {
      colaborador: { select: { id: true, nombres: true, apellidos: true, numeroDocumento: true, fechaIngreso: true, tipoVinculo: true, _count: { select: { contratos: true } } } },
      liquidacion: true,
      pazYSalvo: { include: { items: { orderBy: { id: 'asc' } } } },
      cartas: true,
      procesoDisciplinario: { select: { id: true, asunto: true, decision: true, fechaApertura: true } },
    },
  })
  if (!t) notFound()
  const liq = t.liquidacion
  const pys = t.pazYSalvo
  const detalle = leerDetalleLiquidacion(liq?.detalle)
  const cerrada = t.estado === 'CERRADA'
  const nombre = `${t.colaborador.nombres} ${t.colaborador.apellidos}`

  // Meses sobre los que se promedia el salario variable (para rehacer el cálculo).
  // Laboral: lleva liquidación definitiva (un OPS no). Sin contrato registrado no hay con qué calcularla.
  const llevaLiquidacion = t.colaborador.tipoVinculo !== 'OPS'
  const tieneContrato = t.colaborador._count.contratos > 0
  const ventana = puedeEditar && (liq ? !liq.enviadoFirmaEn : llevaLiquidacion && tieneContrato)
    ? await mesesParaPromedios(t.colaborador.id, t.colaborador.fechaIngreso, t.fechaRetiro)
    : { meses: [], mesesAnual: 0, mesesSemestre: 0, referencia: null }
  const variableGuardado = Object.fromEntries((detalle?.ajustes?.variablePorMes ?? []).map((m) => [m.mes, m.valor]))
  const bases = {
    salarioBase: detalle?.bases?.salarioBase ?? (liq ? Number(liq.salarioBase) : ventana.referencia?.salarioBase ?? null),
    auxilioTransporte: detalle?.bases?.auxilioTransporte ?? ventana.referencia?.auxilioTransporte ?? null,
    promedioVariableAnual: detalle?.bases?.promedioVariableAnual ?? 0,
    promedioVariableSemestre: detalle?.bases?.promedioVariableSemestre ?? 0,
    otroConceptoSalarial: detalle?.bases?.otroConceptoSalarial ?? 0,
    diasSalarioPendiente: detalle?.bases?.diasSalarioPendiente ?? 0,
    periodosConsiderados: detalle?.bases?.periodosConsiderados ?? 0,
  }
  const ajustesMonetarios = {
    salarioBase: detalle?.ajustes?.salarioBase ?? null,
    auxilioTransporte: detalle?.ajustes?.auxilioTransporte ?? null,
  }

  // Soportes de la terminación: lo que se haga por fuera (examen de egreso, etc.).
  const [documentos, tiposDocumento] = await Promise.all([
    prisma.documento.findMany({
      where: { entidadTipo: 'Terminacion', entidadId: id },
      include: { tipoDocumento: { select: { nombre: true } } },
      orderBy: { creadoEn: 'desc' },
    }),
    prisma.tipoDocumento.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }),
  ])

  // Nombres de quienes responden por cada área y de quienes ya verificaron.
  const idsUsuarios = [...new Set((pys?.items ?? []).flatMap((i) => [i.responsableId, i.verificadoPorId]).filter((x): x is string => !!x))]
  const [usuarios, examen, renuncia] = await Promise.all([
    idsUsuarios.length ? prisma.user.findMany({ where: { id: { in: idsUsuarios } }, select: { id: true, name: true } }) : [],
    t.examenMedicoId ? prisma.examenMedico.findUnique({ where: { id: t.examenMedicoId }, select: { fecha: true } }) : null,
    prisma.renuncia.findUnique({ where: { terminacionId: t.id }, select: { creadoEn: true } }),
  ])
  const nombreUsuario = new Map(usuarios.map((u) => [u.id, u.name]))

  // ── Estado de cada paso ──
  const tipoCarta = CARTA_PRINCIPAL[t.tipo] ?? 'CARTA_TERMINACION'
  const carta = t.cartas.find((c) => c.tipo === tipoCarta)
  const cartaRenuncia = t.cartas.find((c) => c.tipo === 'CARTA_RENUNCIA')
  const estadoCarta: EstadoDocumento = { documentoId: carta?.documentoId ?? null, enviadaEn: fecha(carta?.enviadoFirmaEn), firmadaEn: fecha(carta?.firmadoEn) }
  const examenHecho = t.examenNoAsistio ? 'No asistió' : examen ? `Realizado el ${formatFechaCorta(examen.fecha)}` : null
  const areasOk = pys?.items.filter((i) => i.cumplido).length ?? 0
  const areasTotal = pys?.items.length ?? 0
  const acta: EstadoDocumento = { documentoId: pys?.documentoId ?? null, enviadaEn: fecha(pys?.enviadoFirmaEn), firmadaEn: fecha(pys?.firmadoEn) }
  const recibo: EstadoDocumento = { documentoId: liq?.documentoId ?? null, enviadaEn: fecha(liq?.enviadoFirmaEn), firmadaEn: fecha(liq?.firmadoEn) }

  const pasos: PasoRuta[] = [
    { id: 'registro', titulo: 'Registro', detalle: `${TIPO[t.tipo]} · ${formatFechaLarga(t.fechaRetiro)}`, estado: 'hecho' },
    {
      id: 'carta',
      titulo: NOMBRE_CARTA[tipoCarta],
      corto: 'Carta',
      detalle: carta?.firmadoEn ? 'Firmada' : carta?.enviadoFirmaEn ? 'Esperando firma del trabajador' : 'Por firmar y enviar',
      estado: carta?.firmadoEn ? 'hecho' : 'pendiente',
    },
  ]
  if (pys) {
    pasos.push({
      id: 'paz-y-salvo',
      titulo: 'Paz y salvo',
      detalle: pys.firmadoEn ? 'Firmado' : pys.enviadoFirmaEn ? 'Esperando firma del trabajador' : `${areasOk} de ${areasTotal} áreas verificadas`,
      // Opcional: hay retiros con plazos tan cortos que no alcanza, y el pago de
      // la liquidación no puede quedar sujeto a él (art. 65 CST).
      estado: pys.firmadoEn ? 'hecho' : 'opcional',
      opcional: true,
    })
  }
  pasos.push({
    id: 'examen',
    titulo: 'Examen de egreso',
    corto: 'Examen',
    detalle: examenHecho ?? (t.ordenExamenDocId ? 'Orden entregada' : 'Por generar la orden'),
    estado: examenHecho ? 'hecho' : 'opcional',
    opcional: true,
  })
  if (!liq && llevaLiquidacion) {
    pasos.push({ id: 'liquidacion', titulo: 'Liquidación', detalle: tieneContrato ? 'Falta calcularla' : 'Falta el contrato para calcularla', estado: 'pendiente' })
  }
  if (liq) {
    pasos.push({
      id: 'liquidacion',
      titulo: 'Liquidación',
      detalle: liq.pagadoEn ? `Pagada · ${fmtCOP(Number(liq.total))}` : liq.firmadoEn ? 'Firmada · falta el pago' : liq.enviadoFirmaEn ? 'Esperando firma del trabajador' : `${fmtCOP(Number(liq.total))} · por firmar`,
      estado: liq.pagadoEn && liq.firmadoEn ? 'hecho' : 'pendiente',
    })
  }
  pasos.push({
    id: 'seguridad-social',
    titulo: 'Seguridad social',
    corto: 'Seg. social',
    detalle: t.seguridadSocialDocId ? 'Soporte entregado' : 'Por cargar el soporte',
    estado: t.seguridadSocialDocId ? 'hecho' : 'opcional',
    opcional: true,
  })
  pasos.push({ id: 'soportes', titulo: 'Soportes', detalle: documentos.length ? `${documentos.length} documento${documentos.length === 1 ? '' : 's'}` : 'Opcional', estado: 'opcional', opcional: true })

  const requisitos = [
    { texto: `${NOMBRE_CARTA[tipoCarta]} firmada por el trabajador`, ok: !!carta?.firmadoEn },
    ...(!liq && llevaLiquidacion ? [{ texto: 'Liquidación definitiva calculada', ok: false }] : []),
    ...(liq ? [
      { texto: 'Recibido de la liquidación firmado', ok: !!liq.firmadoEn },
      { texto: 'Pago de la liquidación con comprobante', ok: !!liq.pagadoEn },
    ] : []),
  ]
  pasos.push({ id: 'cierre', titulo: 'Cierre', detalle: cerrada ? 'Cerrada' : requisitos.every((r) => r.ok) ? 'Lista para cerrar' : 'Faltan pasos', estado: cerrada ? 'hecho' : 'pendiente' })

  const inicial = pasos.find((p) => p.estado === 'pendiente')?.id ?? 'cierre'

  const paneles: Record<string, React.ReactNode> = {
    registro: (
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <Dato k="Tipo" v={TIPO[t.tipo]} />
        <Dato k="Fecha de retiro" v={formatFechaLarga(t.fechaRetiro)} />
        <Dato k="Trabajador" v={t.retiroAplicadoEn ? `Retirado desde el ${formatFechaCorta(t.retiroAplicadoEn)}` : `Activo hasta su último día; esa noche queda retirado`} />
        <Dato k="Ingreso" v={formatFechaLarga(t.colaborador.fechaIngreso)} />
        <Dato k="Documento" v={t.colaborador.numeroDocumento} />
        {t.preavisoDias != null && <Dato k="Preaviso" v={`${t.preavisoDias} días`} />}
        {renuncia && <Dato k="Origen" v={`Renuncia presentada en la app el ${formatFechaCorta(renuncia.creadoEn)}`} />}
        {t.motivo && <div className="sm:col-span-2"><Dato k="Motivo" v={t.motivo} /></div>}
        {t.tipo === 'CON_JUSTA_CAUSA' && (
          <div className="sm:col-span-2">
            {t.procesoDisciplinario ? (
              <Dato k="Proceso disciplinario" v={
                <Link href={`/juridica/disciplinarios/${t.procesoDisciplinario.id}`} className="text-primary hover:underline">
                  {t.procesoDisciplinario.asunto} ({formatFechaLarga(t.procesoDisciplinario.fechaApertura)})
                </Link>
              } />
            ) : (
              <p className="text-sm text-destructive">⚠ Terminación con justa causa sin proceso disciplinario vinculado.</p>
            )}
          </div>
        )}
      </dl>
    ),
    carta: (
      <div className="space-y-3">
        {cartaRenuncia?.documentoId && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <span className="text-sm font-medium">Carta de renuncia</span>
            <Pill tone="ok">Firmada por el trabajador · {fecha(cartaRenuncia.firmadoEn)}</Pill>
            <span className="flex-1" />
            <VisorPdf documentoId={cartaRenuncia.documentoId} titulo="Carta de renuncia" className={buttonVariants({ size: 'sm', variant: 'outline' }) + ' gap-1.5'}>
              <FileText className="size-3.5" /> Ver
            </VisorPdf>
          </div>
        )}
        <DocumentoFirma
          terminacionId={t.id}
          tipo="CARTA"
          titulo={NOMBRE_CARTA[tipoCarta]}
          estado={estadoCarta}
          listo
          puedeEditar={puedeEditar}
          cerrada={cerrada}
        />
      </div>
    ),
    examen: (
      <ExamenEgreso
        terminacionId={t.id}
        ordenDocId={t.ordenExamenDocId}
        resultado={examenHecho}
        hoy={hoyBogotaISO()}
        puedeEditar={puedeEditar}
        cerrada={cerrada}
      />
    ),
    'seguridad-social': <SeguridadSocial terminacionId={t.id} docId={t.seguridadSocialDocId} puedeEditar={puedeEditar} cerrada={cerrada} />,
    'paz-y-salvo': pys && (
      <PazYSalvoChecklist
        items={pys.items.map((i) => ({
          id: i.id, area: i.area, concepto: i.concepto, cumplido: i.cumplido, observacion: i.observacion,
          responsable: i.responsableId ? nombreUsuario.get(i.responsableId) ?? null : null,
          verificadoPor: i.verificadoPorId ? nombreUsuario.get(i.verificadoPorId) ?? null : null,
        }))}
        acta={acta}
        terminacionId={t.id}
        cerrada={cerrada}
        puedeEditar={puedeEditar}
      />
    ),
    liquidacion: !liq && llevaLiquidacion ? (
      <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
        <p className="font-medium">Todavía no tiene liquidación definitiva.</p>
        {tieneContrato ? (
          <>
            <p className="text-muted-foreground">Calcúlala con «Rehacer el cálculo»: revisa la fecha de retiro y completa el salario y el auxilio mensual si no hay nóminas del año del retiro.</p>
            {!cerrada && puedeEditar && (
              <AccionesLiquidacion
                terminacionId={t.id} colaborador={nombre} fechaRetiro={formatFechaISO(t.fechaRetiro)}
                bases={bases} ventana={ventana} variableGuardado={variableGuardado} ajustesMonetarios={ajustesMonetarios} puedeEditar puedeEliminar={false}
              />
            )}
          </>
        ) : (
          <p className="text-muted-foreground">
            No tiene ningún contrato registrado, y sin él no hay salario ni fecha de inicio con qué calcularla. Súbelo en su ficha (Contratación → Subir contrato existente) y vuelve aquí; mientras tanto, si se liquida por fuera, sube el soporte en «Soportes».
            {' '}<Link href={`/colaboradores/${t.colaborador.id}`} className="font-medium text-primary hover:underline">Ir a la ficha</Link>
          </p>
        )}
      </div>
    ) : liq && (
      <div className="space-y-3">
        <ResumenLiquidacion liq={liq} detalle={detalle} />
        {!cerrada && !liq.enviadoFirmaEn && puedeEditar && (
          <AccionesLiquidacion
            terminacionId={t.id}
            colaborador={nombre}
            fechaRetiro={formatFechaISO(t.fechaRetiro)}
            bases={bases}
            ventana={ventana}
            variableGuardado={variableGuardado}
            ajustesMonetarios={ajustesMonetarios}
            puedeEditar
            puedeEliminar={false}
          />
        )}
        <DocumentoFirma
          terminacionId={t.id}
          tipo="LIQUIDACION"
          titulo="Liquidación definitiva"
          estado={recibo}
          listo
          puedeEditar={puedeEditar}
          cerrada={cerrada}
        />
        <PagoLiquidacion
          terminacionId={t.id}
          total={fmtCOP(Number(liq.total))}
          firmada={!!liq.firmadoEn}
          pagadaEn={fecha(liq.pagadoEn)}
          comprobanteDocId={liq.comprobanteDocId}
          hoy={hoyBogotaISO()}
          puedeEditar={puedeEditar}
          cerrada={cerrada}
        />
      </div>
    ),
    soportes: (
      <GestorDocumentos
        entidadTipo="Terminacion"
        entidadId={t.id}
        sedeId={null}
        documentos={documentos.map((d) => ({
          id: d.id, nombre: d.nombre, tipoDocumentoNombre: d.tipoDocumento?.nombre ?? null,
          mimeType: d.mimeType, tamanoBytes: d.tamanoBytes,
          fechaVencimiento: formatFechaISO(d.fechaVencimiento) || null, creadoEn: d.creadoEn.toISOString(),
        }))}
        tiposDocumento={tiposDocumento.map((x) => ({ id: x.id, nombre: x.nombre, requiereVencimiento: x.requiereVencimiento }))}
        semaforo={[]}
        puedeEditar={puedeEditar}
      />
    ),
    cierre: <CierreTerminacion terminacionId={t.id} requisitos={requisitos} cerrada={cerrada} puedeAprobar={puedeAprobar} />,
  }

  for (const k of Object.keys(paneles)) paneles[k] = <Fragment key={k}>{paneles[k]}</Fragment>

  return (
    <div className="max-w-7xl">
      <Encabezado
        titulo={nombre}
        descripcion={`${TIPO[t.tipo]} · ${formatFechaLarga(t.fechaRetiro)}`}
        volver
        acciones={
          <div className="flex items-center gap-1.5">
            <Pill tone={ESTADO[t.estado]?.tone ?? 'info'}>{ESTADO[t.estado]?.texto ?? t.estado}</Pill>
            <Button asChild size="icon" variant="outline" title="Ver ficha del colaborador" aria-label="Ver ficha del colaborador">
              <Link href={`/colaboradores/${t.colaborador.id}`}><UserRound className="size-4" /></Link>
            </Button>
            {/* Anular solo mientras no esté cerrada: después ya se pagó. */}
            {!cerrada && puedeEliminar && (
              <AccionesLiquidacion
                terminacionId={t.id}
                colaborador={nombre}
                fechaRetiro={formatFechaISO(t.fechaRetiro)}
                bases={bases}
                ventana={{ meses: [], mesesAnual: 0, mesesSemestre: 0, referencia: null }}
                variableGuardado={{}}
                ajustesMonetarios={ajustesMonetarios}
                puedeEditar={false}
                puedeEliminar
              />
            )}
          </div>
        }
      />

      <RutaTerminacion pasos={pasos} paneles={paneles} inicial={inicial} />
    </div>
  )
}

function Dato({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  )
}
