import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { Download, Users, Clock, HandCoins, Gift, BadgeDollarSign, Stethoscope, TriangleAlert, TrendingUp, TrendingDown, Wallet, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Chip, Pill, Stat, type ChipColor, type PillTone } from '@/components/ui-kit'
import { fmtCOP } from '@/lib/moneda'
import { formatFechaCorta } from '@/lib/fechas'
import { TIPO_CUENTA } from '@/lib/etiquetas'
import { AccionesPeriodo } from './acciones-cliente'
import { NovedadesPeriodo } from './novedades-periodo'

export const metadata = { title: 'Periodo de nómina · Smart Gadgets RH' }

const ESTADO: Record<string, string> = { BORRADOR: 'Borrador', CALCULADA: 'Calculada', APROBADA: 'Aprobada', CERRADA: 'Cerrada', PAGADA: 'Pagada' }
const TONO: Record<string, PillTone> = { BORRADOR: 'muted', CALCULADA: 'info', APROBADA: 'warn', CERRADA: 'ok', PAGADA: 'ok' }

export default async function PeriodoNominaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const usuario = await requerirPermiso('nomina', 'VER')
  const puedeOperar = tienePermiso(usuario, 'nomina', 'CREAR')
  const puedeAprobar = tienePermiso(usuario, 'nomina', 'APROBAR')
  const puedeExportar = tienePermiso(usuario, 'nomina', 'EXPORTAR')

  const periodo = await prisma.periodoNomina.findUnique({
    where: { id },
    include: {
      liquidaciones: {
        include: {
          colaborador: { select: { nombres: true, apellidos: true, numeroDocumento: true, banco: { select: { nombre: true } }, tipoCuenta: true, numeroCuenta: true } },
          // Solo la línea de horas extra: se trae aquí (y no con una consulta por
          // liquidación) para no provocar un N+1 cuando el periodo tiene muchos
          // colaboradores.
          detalles: { where: { conceptoCodigo: 'HORAS_EXTRA' }, select: { valor: true } },
        },
        orderBy: { colaborador: { apellidos: 'asc' } },
      },
    },
  })
  if (!periodo) notFound()

  // Novedades del período (comisiones, horas, conceptos): visibles con permiso de
  // operar; editables solo en BORRADOR/CALCULADA (el componente aplica solo lectura).
  const nomColab = { colaborador: { select: { nombres: true, apellidos: true } } }
  const [novedadesConcepto, conceptos, contratosParaNovedad, comisiones, novedadesHoras] = puedeOperar
    ? await Promise.all([
        prisma.novedadConcepto.findMany({
          where: { periodoId: id },
          include: { concepto: true, ...nomColab },
          orderBy: { creadoEn: 'desc' },
        }),
        prisma.conceptoNomina.findMany({
          where: { activo: true, esSistema: false },
          orderBy: { nombre: 'asc' },
        }),
        prisma.contrato.findMany({
          where: { estado: 'ACTIVO', tipo: { in: ['TERMINO_FIJO', 'TERMINO_INDEFINIDO', 'OBRA_LABOR'] } },
          select: { colaboradorId: true, colaborador: { select: { nombres: true, apellidos: true } } },
          orderBy: { colaborador: { apellidos: 'asc' } },
        }),
        prisma.comision.findMany({ where: { periodoId: id }, include: nomColab, orderBy: { creadoEn: 'desc' } }),
        prisma.novedadHoras.findMany({ where: { periodoId: id }, include: nomColab, orderBy: [{ fecha: 'desc' }, { creadoEn: 'desc' }] }),
      ])
    : [[], [], [], [], []]

  const totales = periodo.liquidaciones.reduce(
    (acc, l) => ({
      devengado: acc.devengado + Number(l.totalDevengado),
      deducido: acc.deducido + Number(l.totalDeducido),
      neto: acc.neto + Number(l.neto),
    }),
    { devengado: 0, deducido: 0, neto: 0 },
  )

  // ── Resumen previo (antes de liquidar): qué se incluirá al calcular ──
  let previo: null | {
    contratos: { id: string; colaborador: string; salario: number; minimo: boolean }[]
    comisiones: { n: number; total: number }
    horas: { n: number; total: number }
    bonos: { n: number; total: number }
    prestamos: { n: number; cuotas: number }
    ausencias: number
    smmlv: number | null
  } = null
  if (periodo.liquidaciones.length === 0) {
    // Mismos filtros que usa el liquidador
    const contratos = await prisma.contrato.findMany({
      where: { estado: 'ACTIVO', tipo: { in: ['TERMINO_FIJO', 'TERMINO_INDEFINIDO', 'OBRA_LABOR'] }, fechaInicio: { lte: periodo.fechaFin } },
      include: { colaborador: { select: { nombres: true, apellidos: true } } },
      orderBy: { colaborador: { apellidos: 'asc' } },
    })
    const colabIds = contratos.map((c) => c.colaboradorId)
    const [comisiones, horas, bonos, prestamos, incapacidades, licencias] = await Promise.all([
      prisma.comision.aggregate({ where: { periodoId: id }, _count: true, _sum: { valor: true } }),
      prisma.novedadHoras.aggregate({ where: { periodoId: id }, _count: true, _sum: { horas: true } }),
      prisma.bonificacion.aggregate({ where: { colaboradorId: { in: colabIds }, estadoPago: 'PENDIENTE', periodoId: null }, _count: true, _sum: { valor: true } }),
      prisma.prestamo.findMany({ where: { colaboradorId: { in: colabIds }, estado: 'ACTIVO' }, select: { valorCuota: true, saldo: true } }),
      prisma.incapacidad.count({ where: { colaboradorId: { in: colabIds }, fechaInicio: { lte: periodo.fechaFin }, fechaFin: { gte: periodo.fechaInicio } } }),
      prisma.licencia.count({ where: { colaboradorId: { in: colabIds }, fechaInicio: { lte: periodo.fechaFin }, fechaFin: { gte: periodo.fechaInicio } } }),
    ])
    const smmlv = await prisma.parametroLegal.findFirst({
      where: { clave: 'SMMLV', vigenciaDesde: { lte: periodo.fechaFin }, OR: [{ vigenciaHasta: null }, { vigenciaHasta: { gte: periodo.fechaFin } }] },
      orderBy: { vigenciaDesde: 'desc' },
    })
    previo = {
      contratos: contratos.map((c) => ({
        id: c.colaboradorId,
        colaborador: `${c.colaborador.nombres} ${c.colaborador.apellidos}`,
        salario: c.ganaSalarioMinimo && smmlv ? Number(smmlv.valor) : Number(c.salarioBase),
        minimo: c.ganaSalarioMinimo,
      })),
      comisiones: { n: comisiones._count, total: Number(comisiones._sum.valor ?? 0) },
      horas: { n: horas._count, total: Number(horas._sum.horas ?? 0) },
      bonos: { n: bonos._count, total: Number(bonos._sum.valor ?? 0) },
      prestamos: { n: prestamos.length, cuotas: prestamos.reduce((t, p) => t + Math.min(Number(p.valorCuota), Number(p.saldo)), 0) },
      ausencias: incapacidades + licencias,
      smmlv: smmlv ? Number(smmlv.valor) : null,
    }
  }

  return (
    <div className="max-w-7xl">
      <Encabezado
        titulo={periodo.nombre}
        descripcion={`Periodo ${periodo.tipo === 'QUINCENAL' ? 'quincenal' : 'mensual'} · ${periodo.diasPeriodo} días`}
        acciones={<Pill tone={TONO[periodo.estado] ?? 'muted'}>{ESTADO[periodo.estado]}</Pill>}
      />

      <AccionesPeriodo
        periodoId={periodo.id}
        estado={periodo.estado}
        tieneLiquidaciones={periodo.liquidaciones.length > 0}
        puedeOperar={puedeOperar}
        puedeAprobar={puedeAprobar}
        puedeExportar={puedeExportar}
      />

      {puedeOperar && (
        <NovedadesPeriodo
          periodoId={periodo.id}
          estado={periodo.estado}
          colaboradores={[...new Map(contratosParaNovedad.map((c) => [
            c.colaboradorId,
            { id: c.colaboradorId, nombre: `${c.colaborador.nombres} ${c.colaborador.apellidos}` },
          ])).values()]}
          conceptos={conceptos.map((c) => ({
            id: c.id,
            nombre: c.nombre,
            tipo: c.tipo,
            valorFijo: c.valorFijo != null ? Number(c.valorFijo) : null,
          }))}
          comisiones={comisiones.map((c) => ({
            id: c.id,
            colaborador: `${c.colaborador.nombres} ${c.colaborador.apellidos}`,
            tipo: c.tipo,
            baseCalculo: Number(c.baseCalculo),
            valor: Number(c.valor),
            descripcion: c.descripcion ?? null,
          }))}
          horas={novedadesHoras.map((h) => ({
            id: h.id,
            colaborador: `${h.colaborador.nombres} ${h.colaborador.apellidos}`,
            fecha: formatFechaCorta(h.fecha),
            tipoHora: h.tipoHora,
            horas: Number(h.horas),
            horaInicio: h.horaInicio,
            horaFin: h.horaFin,
          }))}
          conceptosNovedades={novedadesConcepto.map((n) => ({
            id: n.id,
            colaborador: `${n.colaborador.nombres} ${n.colaborador.apellidos}`,
            concepto: n.concepto.nombre,
            tipo: n.concepto.tipo,
            valor: Number(n.valor),
          }))}
          // Panel del sistema de control de asistencia, origen de estas horas.
          // Si la variable no está configurada, el enlace no se muestra.
          urlAsistencia={process.env.ASISTENCIA_URL ?? null}
        />
      )}

      {previo && (
        <div className="mt-4 space-y-4">
          {!previo.smmlv && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <TriangleAlert className="size-4 shrink-0" /> No hay SMMLV vigente para la fecha del periodo. Configura los parámetros legales antes de liquidar.
            </div>
          )}

          <div>
            <h2 className="mb-2 text-base font-medium">Qué se incluirá al liquidar</h2>
            <p className="mb-3 text-sm text-muted-foreground">
              Del {formatFechaCorta(periodo.fechaInicio)} al {formatFechaCorta(periodo.fechaFin)}. Revisa que las novedades estén completas antes de calcular.
            </p>
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
              <ResumenItem icono={Users} color="indigo" titulo={`${previo.contratos.length} colaboradores`} detalle="Contratos laborales activos" />
              <ResumenItem icono={BadgeDollarSign} color="emerald" titulo={previo.comisiones.n > 0 ? `${previo.comisiones.n} comisiones · ${fmtCOP(previo.comisiones.total)}` : 'Sin comisiones'} detalle="Registradas en este periodo" />
              <ResumenItem icono={Clock} color="sky" titulo={previo.horas.n > 0 ? `${previo.horas.n} novedades · ${previo.horas.total} horas` : 'Sin horas extra'} detalle="Horas extra y recargos del periodo" />
              <ResumenItem icono={Gift} color="violet" titulo={previo.bonos.n > 0 ? `${previo.bonos.n} bonos · ${fmtCOP(previo.bonos.total)}` : 'Sin bonos pendientes'} detalle="Bonificaciones que se pagarán aquí" />
              <ResumenItem icono={HandCoins} color="amber" titulo={previo.prestamos.n > 0 ? `${previo.prestamos.n} préstamos · ${fmtCOP(previo.prestamos.cuotas)}` : 'Sin préstamos activos'} detalle="Cuotas que se descontarán" />
              <ResumenItem icono={Stethoscope} color="rose" titulo={previo.ausencias > 0 ? `${previo.ausencias} ausencias en el periodo` : 'Sin ausencias'} detalle="Incapacidades y licencias registradas" />
            </div>
          </div>

          {previo.contratos.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No hay contratos laborales activos para liquidar. Crea contratos antes de calcular.</CardContent></Card>
          ) : (
            <Card><CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-3 text-left font-medium">Colaborador a liquidar</th>
                    <th className="p-3 text-right font-medium">Salario base</th>
                  </tr>
                </thead>
                <tbody>
                  {previo.contratos.map((c) => (
                    <tr key={c.id} className="border-t">
                      <td className="p-3"><Link href={`/colaboradores/${c.id}`} className="hover:underline">{c.colaborador}</Link></td>
                      <td className="p-3 text-right tabular-nums">{fmtCOP(c.salario)}{c.minimo && <span className="ml-1.5 text-xs text-muted-foreground">(SMMLV)</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent></Card>
          )}
        </div>
      )}

      {periodo.liquidaciones.length > 0 && (
        <>
          <div className="my-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <Stat icono={TrendingUp} color="sky" valor={fmtCOP(totales.devengado)} label="Total devengado" />
            <Stat icono={TrendingDown} color="rose" valor={fmtCOP(totales.deducido)} label="Total deducido" />
            <Stat icono={Wallet} color="emerald" valor={fmtCOP(totales.neto)} label="Neto a pagar" className="col-span-2 sm:col-span-1" />
          </div>

          <Card><CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="p-3 text-left font-medium">Colaborador</th>
                  <th className="p-3 text-right font-medium">Horas extra</th>
                  <th className="p-3 text-right font-medium">Devengado</th>
                  <th className="p-3 text-right font-medium hidden sm:table-cell">Deducido</th>
                  <th className="p-3 text-right font-medium">Neto</th>
                  <th className="p-3 text-left font-medium hidden md:table-cell">Cuenta de pago</th>
                  <th className="p-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {periodo.liquidaciones.map((l) => {
                  const banco = l.colaborador.banco?.nombre
                  const cuenta = l.colaborador.numeroCuenta
                  const tipo = l.colaborador.tipoCuenta ? TIPO_CUENTA[l.colaborador.tipoCuenta] : null
                  // Puede haber varias líneas del concepto (una por tramo), así que se suman.
                  const horasExtra = l.detalles.reduce((t, d) => t + Number(d.valor), 0)
                  return (
                  <tr key={l.id} className="border-t">
                    <td className="p-3">
                      <Link href={`/colaboradores/${l.colaboradorId}`} className="hover:underline">{l.colaborador.nombres} {l.colaborador.apellidos}</Link>
                      <p className="text-xs text-muted-foreground">{l.colaborador.numeroDocumento}</p>
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {horasExtra > 0
                        ? fmtCOP(horasExtra)
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="p-3 text-right tabular-nums">{fmtCOP(Number(l.totalDevengado))}</td>
                    <td className="p-3 text-right tabular-nums hidden sm:table-cell">{fmtCOP(Number(l.totalDeducido))}</td>
                    <td className="p-3 text-right tabular-nums font-medium">{fmtCOP(Number(l.neto))}</td>
                    <td className="p-3 hidden md:table-cell">
                      {banco && cuenta
                        ? <span className="text-xs"><span className="font-medium">{banco}</span><span className="text-muted-foreground"> · {tipo ?? 'cuenta'} · {cuenta}</span></span>
                        : <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Sin cuenta registrada</span>}
                    </td>
                    <td className="p-3">
                      {l.documentoId && (
                        <Button variant="ghost" size="icon" asChild aria-label="Desprendible">
                          <a href={`/api/documentos/${l.documentoId}`} target="_blank" rel="noreferrer"><Download className="size-4" /></a>
                        </Button>
                      )}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent></Card>
        </>
      )}
    </div>
  )
}

function ResumenItem({ icono, color, titulo, detalle }: { icono: LucideIcon; color: ChipColor; titulo: string; detalle: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
      <Chip icono={icono} color={color} className="size-9 rounded-[10px]" iconClassName="size-[18px]" />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{titulo}</p>
        <p className="truncate text-xs text-muted-foreground">{detalle}</p>
      </div>
    </div>
  )
}
