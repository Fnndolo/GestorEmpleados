import Link from 'next/link'
import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { Pill, AvatarColaborador, type PillTone } from '@/components/ui-kit'
import { Receipt, Landmark, Paperclip, ShieldCheck, ShieldAlert, ArrowRight, FileCheck2, CalendarClock, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtCOP } from '@/lib/moneda'
import { urlFoto } from '@/lib/foto'
import { formatFechaCorta, hoyBogotaISO } from '@/lib/fechas'
import { ENTIDAD_COMPROBANTE_CUENTA } from '@/server/cuentas-cobro'
import { PagarCuenta } from './pagar-cuenta'
import { NuevaCuentaEmpresa } from '../../contratos/cuentas-cobro/nueva-cuenta-empresa'
import { TIPO_CUENTA } from '@/lib/etiquetas'
import type { Prisma } from '@/generated/prisma/client'
import type { EstadoCuentaCobro } from '@/generated/prisma/enums'

export const metadata = { title: 'Pagos a contratistas OPS · Smart Gadgets RH' }

const ESTADO: Record<string, string> = {
  RADICADA: 'Radicada', EN_VERIFICACION_SS: 'En verificación SS', BLOQUEADA_SS: 'Bloqueada por SS',
  APROBADA: 'Por pagar', PAGADA: 'Pagada', RECHAZADA: 'Rechazada',
}
const TONO: Record<string, PillTone> = {
  RADICADA: 'muted', EN_VERIFICACION_SS: 'warn', BLOQUEADA_SS: 'bad',
  APROBADA: 'accent', PAGADA: 'ok', RECHAZADA: 'bad',
}

// Filtros de la vista (pensada para quien hace los pagos).
const VISTAS = {
  'por-pagar': { label: 'Por pagar', estados: ['APROBADA'] as string[] },
  'en-tramite': { label: 'En trámite', estados: ['RADICADA', 'EN_VERIFICACION_SS', 'BLOQUEADA_SS'] },
  // No son cuentas: son los contratistas que aún no radican la del mes.
  'sin-radicar': { label: 'Sin radicar', estados: [] as string[] },
  pagadas: { label: 'Pagadas', estados: ['PAGADA'] },
  todas: { label: 'Todas', estados: [] },
} as const
type VistaKey = keyof typeof VISTAS

/** "2026-06" → "Junio 2026" para el encabezado de cada grupo. */
const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
function periodoLegible(p: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(p)
  if (!m) return p
  return `${MESES[Number(m[2])] ?? m[2]} ${m[1]}`
}

export default async function PagosOpsPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const usuario = await requerirPermiso('nomina', 'VER')
  // Registrar el pago (con su comprobante) es de quien aprueba la nómina.
  const puedePagar = tienePermiso(usuario, 'nomina', 'APROBAR')
  // Radicar a nombre del contratista es de Contratos (como en Cuentas de cobro).
  const puedeRadicar = tienePermiso(usuario, 'contratos', 'CREAR')
  const { ver } = await searchParams
  const vista: VistaKey = ver && ver in VISTAS ? (ver as VistaKey) : 'por-pagar'
  const estados = VISTAS[vista].estados

  // ── Sin radicar: contratistas con contrato vigente sin cuenta del mes ──
  // Se miran el mes anterior (ya debería estar radicada) y el que va corriendo.
  const hoy = hoyBogotaISO()
  const [anioHoy, mesHoy] = hoy.split('-').map(Number)
  const meses = [new Date(Date.UTC(anioHoy, mesHoy - 2, 1)), new Date(Date.UTC(anioHoy, mesHoy - 1, 1))].map((inicio, i) => ({
    periodo: `${inicio.getUTCFullYear()}-${String(inicio.getUTCMonth() + 1).padStart(2, '0')}`,
    inicio,
    fin: new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + 1, 0)),
    enCurso: i === 1,
  }))
  const contratosVigentes = (await prisma.contratoOps.findMany({
    where: { estado: { in: ['ACTIVO', 'FIRMADO'] }, fechaInicio: { lte: meses[1].fin }, fechaFin: { gte: meses[0].inicio } },
    select: { id: true, numero: true, valorMensual: true, fechaInicio: true, fechaFin: true, colaborador: { select: { id: true, nombres: true, apellidos: true, fotoPath: true } } },
    orderBy: { colaborador: { apellidos: 'asc' } },
  })).flatMap((c) => (c.colaborador ? [{ ...c, colaborador: c.colaborador }] : []))
  const yaRadicadas = await prisma.cuentaCobroOps.findMany({
    where: {
      periodo: { in: meses.map((m) => m.periodo) },
      OR: [{ colaboradorId: { in: contratosVigentes.map((c) => c.colaborador.id) } }, { contratoOpsId: { in: contratosVigentes.map((c) => c.id) } }],
    },
    select: { periodo: true, colaboradorId: true, contratoOps: { select: { colaboradorId: true } } },
  })
  const radicada = new Set(yaRadicadas.map((c) => `${c.colaboradorId ?? c.contratoOps?.colaboradorId}|${c.periodo}`))
  const sinRadicar = meses.map((m) => ({
    ...m,
    contratos: contratosVigentes.filter((c) => c.fechaInicio <= m.fin && c.fechaFin >= m.inicio && !radicada.has(`${c.colaborador.id}|${m.periodo}`)),
  })).filter((m) => m.contratos.length > 0).reverse()
  const totalSinRadicar = sinRadicar.reduce((t, m) => t + m.contratos.length, 0)
  // Las del mes que ya cerró son las atrasadas: se avisan también en las otras pestañas.
  const atrasadas = sinRadicar.find((m) => !m.enCurso)
  const plantillas = vista === 'sin-radicar' && puedeRadicar
    ? await prisma.plantillaCuentaCobro.findMany({ where: { activa: true }, orderBy: [{ esDefecto: 'desc' }, { nombre: 'asc' }], select: { id: true, nombre: true } })
    : []

  // En «Sin radicar» no se listan cuentas (no existen todavía).
  const where: Prisma.CuentaCobroOpsWhereInput = vista === 'sin-radicar'
    ? { id: { in: [] } }
    : estados.length ? { estado: { in: estados as EstadoCuentaCobro[] } } : {}
  const bankSelect = { select: { id: true, nombres: true, apellidos: true, fotoPath: true, banco: { select: { nombre: true } }, tipoCuenta: true, numeroCuenta: true } }

  const cuentas = await prisma.cuentaCobroOps.findMany({
    where,
    orderBy: [{ periodo: 'desc' }, { creadoEn: 'desc' }],
    take: 300,
    include: {
      soporteSs: { select: { estadoVerificacion: true } },
      colaborador: bankSelect,
      contratoOps: { select: { colaborador: bankSelect } },
    },
  })

  // Total "por pagar" (aprobadas) — la cifra que le importa al pagador, sin filtrar por vista.
  const aprobadas = await prisma.cuentaCobroOps.aggregate({ where: { estado: 'APROBADA' }, _sum: { valor: true }, _count: true })
  const totalPorPagar = Number(aprobadas._sum.valor ?? 0)

  // Comprobante de cada cuenta pagada (el último que se subió).
  const comprobantes = await prisma.documento.findMany({
    where: { entidadTipo: ENTIDAD_COMPROBANTE_CUENTA, entidadId: { in: cuentas.filter((c) => c.estado === 'PAGADA').map((c) => c.id) } },
    orderBy: { creadoEn: 'desc' },
    select: { id: true, entidadId: true },
  })
  const comprobanteDe = new Map<string, string>()
  for (const d of comprobantes) if (!comprobanteDe.has(d.entidadId)) comprobanteDe.set(d.entidadId, d.id)

  // Aplana + agrupa por periodo string.
  const filas = cuentas.map((c) => {
    const owner = c.colaborador ?? c.contratoOps?.colaborador ?? null
    const banco = owner?.banco?.nombre
    const cuenta = owner?.numeroCuenta
    const tipo = owner?.tipoCuenta ? TIPO_CUENTA[owner.tipoCuenta] : null
    return {
      id: c.id,
      nombre: owner ? `${owner.nombres} ${owner.apellidos}` : '—',
      colaboradorId: owner?.id ?? null,
      fotoPath: owner?.fotoPath ?? null,
      numero: c.numero,
      concepto: c.concepto,
      valor: Number(c.valor),
      estado: c.estado as string,
      fechaRadicacion: formatFechaCorta(c.fechaRadicacion),
      fechaPago: c.fechaPago ? formatFechaCorta(c.fechaPago) : null,
      fechaPagoISO: c.fechaPago ? c.fechaPago.toISOString().slice(0, 10) : null,
      comprobanteId: comprobanteDe.get(c.id) ?? null,
      documentoId: c.documentoId,
      esOps: Boolean(c.contratoOpsId) && c.requierePila,
      ss: c.soporteSs?.estadoVerificacion ?? null,
      periodo: c.periodo,
      cuentaBancaria: banco && cuenta ? `${banco} · ${tipo ?? 'cuenta'} · ${cuenta}` : null,
    }
  })

  const grupos = new Map<string, typeof filas>()
  for (const f of filas) {
    const arr = grupos.get(f.periodo) ?? []
    arr.push(f)
    grupos.set(f.periodo, arr)
  }
  const periodosOrdenados = [...grupos.keys()].sort((a, b) => b.localeCompare(a))

  return (
    <div className="max-w-5xl">
      {/* Mismo nombre que el botón de Nómina que trae aquí; sin descripción. */}
      <Encabezado volver enLinea titulo="Pagos OPS" />

      {/* Total por pagar (cuentas aprobadas) */}
      <Card className="mb-4 py-0">
        <CardContent className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Por pagar</p>
            <p className="truncate text-2xl font-bold tabular-nums">{fmtCOP(totalPorPagar)}</p>
          </div>
          <p className="shrink-0 text-sm text-muted-foreground">
            <b className="text-foreground tabular-nums">{aprobadas._count}</b> cuenta{aprobadas._count === 1 ? '' : 's'}
          </p>
        </CardContent>
      </Card>

      {/* Filtros: mismas pestañas que el resto de la app */}
      <div className="mb-4 flex gap-1.5 overflow-x-auto">
        {(Object.keys(VISTAS) as VistaKey[]).map((k) => (
          <Link
            key={k}
            href={`/nomina/ops?ver=${k}`}
            className={cn(
              'shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
              vista === k ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent',
            )}
          >
            {VISTAS[k].label}
            {k === 'sin-radicar' && totalSinRadicar > 0 && (
              <span className={cn('ml-1.5 rounded-full px-1.5 text-xs tabular-nums', vista === k ? 'bg-primary-foreground/20' : 'bg-amber-500/15 text-amber-700 dark:text-amber-400')}>{totalSinRadicar}</span>
            )}
          </Link>
        ))}
      </div>

      {/* Atrasadas (mes que ya cerró) a la vista desde cualquier pestaña. */}
      {atrasadas && vista !== 'sin-radicar' && (
        <Link href="/nomina/ops?ver=sin-radicar" className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-amber-800 transition-colors hover:bg-amber-500/10 dark:text-amber-300">
          <TriangleAlert className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">
            {atrasadas.contratos.length === 1
              ? `${atrasadas.contratos[0].colaborador.nombres} ${atrasadas.contratos[0].colaborador.apellidos} aún no radica la cuenta de ${periodoLegible(atrasadas.periodo)}`
              : `${atrasadas.contratos.length} contratistas aún no radican la cuenta de ${periodoLegible(atrasadas.periodo)}`}
          </span>
          <ArrowRight className="size-4 shrink-0" />
        </Link>
      )}

      {vista === 'sin-radicar' ? (
        sinRadicar.length === 0 ? (
          <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <CalendarClock className="size-8" />
            <p>Todos los contratistas con contrato vigente ya radicaron su cuenta.</p>
          </CardContent></Card>
        ) : (
          <div className="space-y-4">
            {sinRadicar.map((m) => (
              <section key={m.periodo}>
                <div className="mb-1.5 flex items-baseline justify-between px-1">
                  <h2 className="text-[13px] font-bold">{periodoLegible(m.periodo)}{m.enCurso ? ' · en curso' : ' · atrasada'}</h2>
                  <span className="text-xs text-muted-foreground">{m.contratos.length} sin radicar</span>
                </div>
                <Card><CardContent className="divide-y p-0">
                  {m.contratos.map((c) => {
                    const nombre = `${c.colaborador.nombres} ${c.colaborador.apellidos}`
                    return (
                      <div key={c.id} className="flex flex-wrap items-center gap-3 p-3">
                        <AvatarColaborador nombre={nombre} fotoUrl={urlFoto(c.colaborador.id, c.colaborador.fotoPath, true)} />
                        <div className="min-w-0 flex-1">
                          <Link href={`/contratos/ops/${c.id}`} className="block truncate text-sm font-medium hover:underline">{nombre}</Link>
                          <p className="truncate text-xs text-muted-foreground">
                            {c.numero}{c.valorMensual != null ? ` · honorarios ${fmtCOP(Number(c.valorMensual))}/mes` : ''}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {/* En el celular el estado ya lo dice el título del mes (· en curso o no): así cabe el nombre. */}
                          <span className="hidden sm:inline-flex"><Pill tone={m.enCurso ? 'muted' : 'warn'}>{m.enCurso ? 'Por radicar' : 'Atrasada'}</Pill></span>
                          {puedeRadicar && (
                            <NuevaCuentaEmpresa
                              plantillas={plantillas}
                              inicial={{ colaboradorId: c.colaborador.id, nombre, periodo: m.periodo, valor: c.valorMensual != null ? Number(c.valorMensual) : null, concepto: 'Honorarios del mes' }}
                            />
                          )}
                        </div>
                      </div>
                    )
                  })}
                </CardContent></Card>
              </section>
            ))}
            <p className="px-1 text-xs text-muted-foreground">
              Al radicarla aquí, la cuenta queda a nombre del contratista y él recibe el aviso para revisarla y adjuntar su planilla de seguridad social.
            </p>
          </div>
        )
      ) : 
filas.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
          <Receipt className="size-8" />
          <p>Sin cuentas en «{VISTAS[vista].label}».</p>
          <Link href="/contratos/cuentas-cobro" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            Cuentas de cobro <ArrowRight className="size-3.5" />
          </Link>
        </CardContent></Card>
      ) : (
        <div className="space-y-4">
          {periodosOrdenados.map((periodo) => {
            const grupo = grupos.get(periodo)!
            const subtotal = grupo.filter((f) => f.estado === 'APROBADA').reduce((s, f) => s + f.valor, 0)
            return (
              <section key={periodo}>
                <div className="mb-1.5 flex items-baseline justify-between px-1">
                  <h2 className="text-[13px] font-bold">{periodoLegible(periodo)}</h2>
                  {subtotal > 0 && <span className="text-xs text-muted-foreground">Por pagar: <b className="text-foreground tabular-nums">{fmtCOP(subtotal)}</b></span>}
                </div>
                <Card><CardContent className="p-0 divide-y">
                  {grupo.map((f) => (
                    <div key={f.id} className="flex flex-wrap items-center gap-3 p-3">
                      <AvatarColaborador nombre={f.nombre} fotoUrl={f.colaboradorId ? urlFoto(f.colaboradorId, f.fotoPath, true) : null} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{f.nombre}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {f.numero}{f.concepto ? ` · ${f.concepto}` : ''} · radicada {f.fechaRadicacion}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs">
                          <Landmark className="size-3.5 shrink-0 text-muted-foreground" />
                          {f.cuentaBancaria
                            ? <span className="text-muted-foreground">{f.cuentaBancaria}</span>
                            : <span className="font-medium text-amber-600 dark:text-amber-400">Sin cuenta bancaria registrada</span>}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="text-sm font-semibold tabular-nums">{fmtCOP(f.valor)}</span>
                        <div className="flex items-center gap-1.5">
                          {f.documentoId && (
                            <VisorPdf documentoId={f.documentoId} titulo="Cuenta de cobro" className="text-muted-foreground hover:text-primary">
                              <Paperclip className="size-3.5" /><span className="sr-only">Ver la cuenta de cobro</span>
                            </VisorPdf>
                          )}
                          {/* Seguridad social: solo aplica a contratistas OPS y es requisito legal para pagar */}
                          {f.esOps && (
                            f.ss === 'VALIDA'
                              ? <span title="Seguridad social verificada"><ShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" /></span>
                              : <span title={f.ss === 'INVALIDA' ? 'Soporte de SS inválido' : 'Falta verificar la seguridad social'}><ShieldAlert className="size-3.5 text-amber-500" /></span>
                          )}
                          <Pill tone={TONO[f.estado] ?? 'muted'}>{f.estado === 'PAGADA' && f.fechaPago ? `Pagada · ${f.fechaPago}` : (ESTADO[f.estado] ?? f.estado)}</Pill>
                        </div>
                        {/* Pagar con el comprobante, ahí mismo; y ver (o cambiar) el de las ya pagadas. */}
                        {f.estado === 'APROBADA' && puedePagar && (
                          <PagarCuenta cuentaId={f.id} numero={f.numero} nombre={f.nombre} valor={fmtCOP(f.valor)} hoy={hoy} />
                        )}
                        {f.estado === 'PAGADA' && (f.comprobanteId || puedePagar) && (
                          <div className="flex items-center gap-1">
                            {f.comprobanteId && (
                              <VisorPdf documentoId={f.comprobanteId} titulo={`Comprobante de pago · ${f.numero}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                                <FileCheck2 className="size-3.5" /> Comprobante
                              </VisorPdf>
                            )}
                            {puedePagar && (
                              <PagarCuenta cuentaId={f.id} numero={f.numero} nombre={f.nombre} valor={fmtCOP(f.valor)} hoy={hoy} pagada conComprobante={!!f.comprobanteId} fechaPago={f.fechaPagoISO} />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent></Card>
              </section>
            )
          })}
          <p className="px-1 text-xs text-muted-foreground">
            Para verificar la seguridad social o aprobar una cuenta, ve a{' '}
            <Link href="/contratos/cuentas-cobro" className="text-primary hover:underline">Contratos → Cuentas de cobro</Link>.
          </p>
        </div>
      )}
    </div>
  )
}
