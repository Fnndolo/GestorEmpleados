import Link from 'next/link'
import { requerirPermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { Chip, Pill, type PillTone } from '@/components/ui-kit'
import { Receipt, Landmark, Paperclip, ShieldCheck, ShieldAlert, ChevronLeft, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtCOP } from '@/lib/moneda'
import { formatFechaCorta } from '@/lib/fechas'
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
  await requerirPermiso('nomina', 'VER')
  const { ver } = await searchParams
  const vista: VistaKey = ver && ver in VISTAS ? (ver as VistaKey) : 'por-pagar'
  const estados = VISTAS[vista].estados

  const where: Prisma.CuentaCobroOpsWhereInput = estados.length ? { estado: { in: estados as EstadoCuentaCobro[] } } : {}
  const bankSelect = { select: { nombres: true, apellidos: true, banco: { select: { nombre: true } }, tipoCuenta: true, numeroCuenta: true } }

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

  // Aplana + agrupa por periodo string.
  const filas = cuentas.map((c) => {
    const owner = c.colaborador ?? c.contratoOps?.colaborador ?? null
    const banco = owner?.banco?.nombre
    const cuenta = owner?.numeroCuenta
    const tipo = owner?.tipoCuenta ? TIPO_CUENTA[owner.tipoCuenta] : null
    return {
      id: c.id,
      nombre: owner ? `${owner.nombres} ${owner.apellidos}` : '—',
      numero: c.numero,
      concepto: c.concepto,
      valor: Number(c.valor),
      estado: c.estado as string,
      fechaRadicacion: formatFechaCorta(c.fechaRadicacion),
      documentoId: c.documentoId,
      esOps: Boolean(c.contratoOpsId),
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
      <Link href="/nomina" className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"><ChevronLeft className="size-3.5" /> Nómina</Link>
      <Encabezado
        titulo="Pagos a contratistas OPS"
        descripcion="Consulta de cuentas de cobro para el pago. Es independiente de la liquidación de nómina laboral: aquí ves cuánto pagar a cada contratista, a qué cuenta y si su seguridad social está en regla."
      />

      {/* Total por pagar */}
      <Card className="mb-4 border-primary/30 bg-primary/5">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div>
            <p className="text-xs text-muted-foreground">Total por pagar (cuentas aprobadas)</p>
            <p className="text-2xl font-semibold tabular-nums">{fmtCOP(totalPorPagar)}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium">{aprobadas._count} cuenta{aprobadas._count === 1 ? '' : 's'}</p>
            <p className="text-xs text-muted-foreground">esperando pago</p>
          </div>
        </CardContent>
      </Card>

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {(Object.keys(VISTAS) as VistaKey[]).map((k) => (
          <Link
            key={k}
            href={`/nomina/ops?ver=${k}`}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              vista === k ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent/40',
            )}
          >
            {VISTAS[k].label}
          </Link>
        ))}
      </div>

      {filas.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
          <Receipt className="size-8" />
          <p>No hay cuentas de cobro en «{VISTAS[vista].label}».</p>
          <Link href="/contratos/cuentas-cobro" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            Ir a gestionar cuentas de cobro <ArrowRight className="size-3.5" />
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
                      <Chip icono={Receipt} color={f.esOps ? 'teal' : 'sky'} />
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
                            <a href={`/api/documentos/${f.documentoId}`} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary" title="Ver PDF de la cuenta de cobro">
                              <Paperclip className="size-3.5" />
                            </a>
                          )}
                          {/* Seguridad social: solo aplica a contratistas OPS y es requisito legal para pagar */}
                          {f.esOps && (
                            f.ss === 'VALIDA'
                              ? <span title="Seguridad social verificada"><ShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" /></span>
                              : <span title={f.ss === 'INVALIDA' ? 'Soporte de SS inválido' : 'Falta verificar la seguridad social'}><ShieldAlert className="size-3.5 text-amber-500" /></span>
                          )}
                          <Pill tone={TONO[f.estado] ?? 'muted'}>{ESTADO[f.estado] ?? f.estado}</Pill>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent></Card>
              </section>
            )
          })}
          <p className="px-1 text-xs text-muted-foreground">
            Para verificar la seguridad social, aprobar o marcar como pagada una cuenta, ve a{' '}
            <Link href="/contratos/cuentas-cobro" className="text-primary hover:underline">Contratos → Cuentas de cobro</Link>.
          </p>
        </div>
      )}
    </div>
  )
}
