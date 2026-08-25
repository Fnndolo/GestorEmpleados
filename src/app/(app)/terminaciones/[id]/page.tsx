import { notFound } from 'next/navigation'
import { AccionesLiquidacion } from './acciones-liquidacion'
import Link from 'next/link'
import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatFechaLarga, formatFechaISO } from '@/lib/fechas'
import { GestorDocumentos } from '@/components/documentos/gestor-documentos'
import { fmtCOP } from '@/lib/moneda'
import { PazYSalvoChecklist } from './paz-y-salvo'
import { mesesParaPromedios } from '@/server/nomina/bases-liquidacion'

export const metadata = { title: 'Terminación · Smart Gadgets RH' }

const TIPO: Record<string, string> = {
  RENUNCIA_VOLUNTARIA: 'Renuncia voluntaria', SIN_JUSTA_CAUSA: 'Sin justa causa', CON_JUSTA_CAUSA: 'Con justa causa',
  TERMINACION_ANTICIPADA: 'Terminación anticipada', MUTUO_ACUERDO: 'Mutuo acuerdo', VENCIMIENTO_PLAZO: 'Vencimiento del plazo',
  PERIODO_PRUEBA: 'Periodo de prueba', FIN_OPS: 'Fin OPS',
}

export default async function TerminacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const usuario = await requerirPermiso('terminaciones', 'VER')
  const puedeEditar = tienePermiso(usuario, 'terminaciones', 'EDITAR')
  const puedeAprobar = tienePermiso(usuario, 'terminaciones', 'APROBAR')
  const puedeEliminar = tienePermiso(usuario, 'terminaciones', 'ELIMINAR')

  const t = await prisma.terminacion.findUnique({
    where: { id },
    include: {
      colaborador: { select: { id: true, nombres: true, apellidos: true, numeroDocumento: true, fechaIngreso: true } },
      liquidacion: true,
      pazYSalvo: { include: { items: true } },
      procesoDisciplinario: { select: { id: true, asunto: true, decision: true, fechaApertura: true } },
    },
  })
  if (!t) notFound()
  const liq = t.liquidacion
  // El desglose línea por línea vive en el JSON del cálculo. Las liquidaciones
  // hechas antes de separar salario, auxilio y seguridad social no lo traen: en
  // ese caso se muestran solo las columnas, y rehacer el cálculo lo completa.
  const detalle = leerDetalle(liq?.detalle)

  // Meses sobre los que se promedia el salario variable. Se piden en pantalla
  // uno por uno para que nadie tenga que calcular el promedio a mano.
  const ventana = puedeEditar
    ? await mesesParaPromedios(t.colaborador.id, t.colaborador.fechaIngreso, t.fechaRetiro)
    : { meses: [], mesesAnual: 0, mesesSemestre: 0 }
  const variableGuardado = Object.fromEntries(
    (detalle?.ajustes?.variablePorMes ?? []).map((m) => [m.mes, m.valor]),
  )

  // Actas y soportes de la terminación (carta, liquidación firmada, acta de entrega…)
  const [documentos, tiposDocumento] = await Promise.all([
    prisma.documento.findMany({
      where: { entidadTipo: 'Terminacion', entidadId: id },
      include: { tipoDocumento: { select: { nombre: true } } },
      orderBy: { creadoEn: 'desc' },
    }),
    prisma.tipoDocumento.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }),
  ])

  return (
    <div className="max-w-5xl">
      <Encabezado
        titulo={`${t.colaborador.nombres} ${t.colaborador.apellidos}`}
        descripcion={`${TIPO[t.tipo]} · ${formatFechaLarga(t.fechaRetiro)}`}
        acciones={<Badge variant={t.estado === 'CERRADA' ? 'default' : 'outline'}>{t.estado}</Badge>}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/colaboradores/${t.colaborador.id}`} className="text-sm text-primary hover:underline">Ver ficha del colaborador →</Link>
        {/* Rehacer y anular solo mientras no esté cerrada: después ya se pagó. */}
        {t.estado !== 'CERRADA' && (
          <AccionesLiquidacion
            terminacionId={t.id}
            colaborador={`${t.colaborador.nombres} ${t.colaborador.apellidos}`}
            fechaRetiro={formatFechaISO(t.fechaRetiro)}
            bases={{
              auxilioTransporte: detalle?.bases?.auxilioTransporte ?? 0,
              promedioVariableAnual: detalle?.bases?.promedioVariableAnual ?? 0,
              promedioVariableSemestre: detalle?.bases?.promedioVariableSemestre ?? 0,
              otroConceptoSalarial: detalle?.bases?.otroConceptoSalarial ?? 0,
              diasSalarioPendiente: detalle?.bases?.diasSalarioPendiente ?? 0,
              periodosConsiderados: detalle?.bases?.periodosConsiderados ?? 0,
            }}
            ventana={ventana}
            variableGuardado={variableGuardado}
            puedeEditar={puedeEditar}
            puedeEliminar={puedeEliminar}
          />
        )}
      </div>

      {/* Justa causa: proceso disciplinario que la sustenta (debido proceso) */}
      {t.tipo === 'CON_JUSTA_CAUSA' && (
        <Card className="mb-4"><CardContent className="py-3">
          {t.procesoDisciplinario ? (
            <p className="text-sm">
              <span className="font-medium">Sustentada en el proceso disciplinario:</span>{' '}
              <Link href={`/juridica/disciplinarios/${t.procesoDisciplinario.id}`} className="text-primary hover:underline">
                {t.procesoDisciplinario.asunto} ({formatFechaLarga(t.procesoDisciplinario.fechaApertura)})
              </Link>
              {t.procesoDisciplinario.decision && <span className="text-muted-foreground"> · {t.procesoDisciplinario.decision}</span>}
            </p>
          ) : (
            <p className="text-sm text-destructive">
              ⚠ Terminación con justa causa sin proceso disciplinario vinculado (registrada antes del control de debido proceso).
            </p>
          )}
        </CardContent></Card>
      )}

      {/* Liquidación definitiva */}
      {liq && <ResumenLiquidacion liq={liq} detalle={detalle} />}

      {/* Paz y salvo */}
      {t.pazYSalvo && (
        <PazYSalvoChecklist
          estado={t.pazYSalvo.estado}
          items={t.pazYSalvo.items.map((i) => ({ id: i.id, area: i.area, concepto: i.concepto, cumplido: i.cumplido, observacion: i.observacion }))}
          terminacionId={t.id}
          terminacionEstado={t.estado}
          puedeEditar={puedeEditar}
          puedeAprobar={puedeAprobar}
        />
      )}

      {/* Actas y soportes: carta de terminación, liquidación firmada, renuncia, actas de entrega… */}
      <div className="mt-6">
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
      </div>
    </div>
  )
}

/** Desglose guardado por el calculador. Puede faltar en liquidaciones antiguas. */
type Detalle = {
  salario?: number
  auxilioTransporte?: number
  otroConceptoSalarial?: number
  salud?: number
  pension?: number
  saldoPrestamo?: number
  totalDevengado?: number
  totalDeducciones?: number
  diasSalario?: number
  diasPrima?: number
  baseCesantias?: number
  basePrima?: number
  baseVacaciones?: number
  baseSeguridadSocial?: number
  ajustes?: { variablePorMes?: { mes: string; valor: number }[] }
  bases?: {
    auxilioTransporte?: number
    promedioVariableAnual?: number
    promedioVariableSemestre?: number
    otroConceptoSalarial?: number
    diasSalarioPendiente?: number
    periodosConsiderados?: number
  }
}

function leerDetalle(d: unknown): Detalle | null {
  return d && typeof d === 'object' ? (d as Detalle) : null
}

type LiqFila = { k: string; sub?: string; v: number }

/**
 * Resumen de la liquidación con la misma estructura de la colilla que revisa el
 * contador: ingresos arriba, deducciones al lado y el total abajo. Antes se
 * mostraba una sola lista de prestaciones sin el salario del último tramo ni la
 * seguridad social, y no había forma de cuadrarla contra el documento contable.
 */
function ResumenLiquidacion({ liq, detalle }: {
  liq: { diasLiquidados: number; salarioBase: unknown; cesantias: unknown; interesesCesantias: unknown; prima: unknown; vacaciones: unknown; indemnizacion: unknown; deducciones: unknown; total: unknown }
  detalle: Detalle | null
}) {
  const n = (v: unknown) => Number(v ?? 0)
  const dias = liq.diasLiquidados

  const ingresos: LiqFila[] = [
    { k: 'Salario', sub: detalle?.diasSalario ? `${detalle.diasSalario} días` : undefined, v: n(detalle?.salario) },
    { k: 'Auxilio de transporte', v: n(detalle?.auxilioTransporte) },
    { k: 'Otro concepto salarial', sub: 'comisiones y horas sin pagar', v: n(detalle?.otroConceptoSalarial) },
    { k: 'Cesantías', sub: `${dias} días`, v: n(liq.cesantias) },
    { k: 'Intereses cesantías', sub: `12% · ${dias} días`, v: n(liq.interesesCesantias) },
    { k: 'Prima salarial', sub: detalle?.diasPrima ? `${detalle.diasPrima} días` : undefined, v: n(liq.prima) },
    { k: 'Vacaciones compensadas', v: n(liq.vacaciones) },
    { k: 'Indemnización', v: n(liq.indemnizacion) },
  ].filter((f) => f.v > 0)

  const deducciones: LiqFila[] = [
    { k: 'Salud', sub: '4%', v: n(detalle?.salud) },
    { k: 'Fondo de pensión', sub: '4%', v: n(detalle?.pension) },
    { k: 'Saldo de préstamo', v: n(detalle?.saldoPrestamo) },
  ].filter((f) => f.v > 0)

  // Liquidaciones viejas no traen el desglose de deducciones; ahí manda la columna.
  const totalDeducciones = deducciones.length > 0 ? deducciones.reduce((t, f) => t + f.v, 0) : n(liq.deducciones)
  const totalIngresos = ingresos.reduce((t, f) => t + f.v, 0)

  return (
    <Card className="mb-4"><CardContent className="py-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">Liquidación definitiva (borrador para revisión contable)</h3>
        <p className="text-xs text-muted-foreground">
          {dias} días liquidados · salario base {fmtCOP(n(liq.salarioBase))}
        </p>
      </div>

      <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
        <Bloque titulo="Ingresos" filas={ingresos} total={totalIngresos} />
        {(deducciones.length > 0 || totalDeducciones > 0) && (
          <Bloque titulo="Deducciones" filas={deducciones} total={totalDeducciones} />
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t pt-3">
        <span className="font-medium">Total a pagar</span>
        <span className="text-lg font-semibold text-emerald-600 tabular-nums">{fmtCOP(n(liq.total))}</span>
      </div>

      {/* Las bases se muestran porque son lo primero que revisa el contador:
          de ellas salen cesantías y prima, y cada una usa una ventana distinta. */}
      {detalle?.baseCesantias != null && (
        <dl className="mt-4 grid gap-x-6 gap-y-1.5 border-t pt-3 text-xs sm:grid-cols-2">
          <Base k="Base de cesantías" v={detalle.baseCesantias} ayuda="salario + auxilio + promedio del año" />
          <Base k="Base de prima" v={detalle.basePrima} ayuda="salario + auxilio + promedio del semestre" />
          <Base k="Base de vacaciones" v={detalle.baseVacaciones} ayuda="salario ordinario, sin auxilio" />
          <Base k="Base de seguridad social" v={detalle.baseSeguridadSocial} ayuda="solo lo que constituye salario" />
        </dl>
      )}
    </CardContent></Card>
  )
}

function Bloque({ titulo, filas, total }: { titulo: string; filas: LiqFila[]; total: number }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <dl className="divide-y text-sm">
        {filas.map((f) => (
          <div key={f.k} className="flex items-baseline justify-between gap-3 py-1.5">
            <dt className="min-w-0">
              {f.k}
              {f.sub && <span className="ml-1.5 text-xs text-muted-foreground">{f.sub}</span>}
            </dt>
            <dd className="shrink-0 tabular-nums">{fmtCOP(f.v)}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-1.5 flex justify-between border-t pt-1.5 text-sm font-medium">
        <span>Total {titulo.toLowerCase()}</span>
        <span className="tabular-nums">{fmtCOP(total)}</span>
      </div>
    </div>
  )
}

function Base({ k, v, ayuda }: { k: string; v: number | undefined; ayuda: string }) {
  if (v == null) return null
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{k} <span className="hidden sm:inline">· {ayuda}</span></dt>
      <dd className="shrink-0 tabular-nums">{fmtCOP(v)}</dd>
    </div>
  )
}
