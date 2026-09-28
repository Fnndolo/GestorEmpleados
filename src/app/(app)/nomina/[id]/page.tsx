import { notFound } from 'next/navigation'
import { AdjuntarDocumento } from '@/components/documentos/adjuntar-documento'
import Link from 'next/link'
import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { Eye, TriangleAlert, TrendingUp, TrendingDown, Wallet, Calculator } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { Pill, Stat, type PillTone } from '@/components/ui-kit'
import { fmtCOP } from '@/lib/moneda'
import { TIPO_CUENTA } from '@/lib/etiquetas'
import { AccionesPeriodo } from './acciones-cliente'

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

  // Novedades que este periodo RECOGIÓ. Registrarlas se hace en /nomina/novedades,
  // fuera de todo periodo; aquí solo se muestra el resumen de lo que entró.
  const [novedadesConcepto, comisiones, novedadesHoras] = puedeOperar
    ? await Promise.all([
        prisma.novedadConcepto.count({ where: { periodoId: id } }),
        prisma.comision.findMany({ where: { periodoId: id }, select: { valor: true } }),
        prisma.novedadHoras.findMany({ where: { periodoId: id }, select: { horas: true } }),
      ])
    : [0, [], []]

  const totales = periodo.liquidaciones.reduce(
    (acc, l) => ({
      devengado: acc.devengado + Number(l.totalDevengado),
      deducido: acc.deducido + Number(l.totalDeducido),
      neto: acc.neto + Number(l.neto),
    }),
    { devengado: 0, deducido: 0, neto: 0 },
  )

  const filas: Fila[] = periodo.liquidaciones.map((l) => ({
    id: l.id,
    colaboradorId: l.colaboradorId,
    nombre: `${l.colaborador.nombres} ${l.colaborador.apellidos}`,
    documento: l.colaborador.numeroDocumento,
    // Puede haber varias líneas del concepto (una por tramo), así que se suman.
    horasExtra: l.detalles.reduce((t, d) => t + Number(d.valor), 0),
    devengado: Number(l.totalDevengado),
    deducido: Number(l.totalDeducido),
    neto: Number(l.neto),
    cuenta: l.colaborador.banco?.nombre && l.colaborador.numeroCuenta
      ? { banco: l.colaborador.banco.nombre, tipo: l.colaborador.tipoCuenta ? TIPO_CUENTA[l.colaborador.tipoCuenta] : 'cuenta', numero: l.colaborador.numeroCuenta }
      : null,
    documentoId: l.documentoId,
  }))

  // El periodo nace calculado. Si todavía no lo está (el cálculo falló al
  // crearlo), lo único que se necesita saber es si falta el SMMLV.
  const sinCalcular = periodo.liquidaciones.length === 0
  const smmlv = sinCalcular
    ? await prisma.parametroLegal.findFirst({
        where: { clave: 'SMMLV', vigenciaDesde: { lte: periodo.fechaFin }, OR: [{ vigenciaHasta: null }, { vigenciaHasta: { gte: periodo.fechaFin } }] },
        select: { id: true },
      })
    : null

  return (
    <div className="max-w-7xl">
      <Encabezado
        volver
        titulo={periodo.nombre}
        descripcion={`Periodo ${periodo.tipo === 'QUINCENAL' ? 'quincenal' : 'mensual'} · ${periodo.diasPeriodo} días`}
        acciones={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Pill tone={TONO[periodo.estado] ?? 'muted'}>{ESTADO[periodo.estado]}</Pill>
            <AccionesPeriodo
              periodoId={periodo.id}
              estado={periodo.estado}
              tieneLiquidaciones={!sinCalcular}
              puedeOperar={puedeOperar}
              puedeAprobar={puedeAprobar}
              puedeExportar={puedeExportar}
            />
          </div>
        }
      />

      {sinCalcular && (
        <Card className="mt-2"><CardContent className="flex flex-col items-center gap-2 py-10 text-center">
          <Calculator className="size-8 text-muted-foreground" />
          <p className="font-medium">Este periodo todavía no está calculado</p>
          {smmlv ? (
            <p className="text-sm text-muted-foreground">Usa «Calcular» arriba: se liquida a todos con las novedades registradas hasta hoy.</p>
          ) : (
            <p className="flex items-center gap-1.5 text-sm text-destructive">
              <TriangleAlert className="size-4 shrink-0" /> No hay SMMLV vigente para la fecha del periodo: configúralo en los parámetros legales.
            </p>
          )}
        </CardContent></Card>
      )}

      {periodo.liquidaciones.length > 0 && (
        <>
          <div className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <Stat icono={TrendingUp} color="sky" valor={fmtCOP(totales.devengado)} label="Total devengado" />
            <Stat icono={TrendingDown} color="rose" valor={fmtCOP(totales.deducido)} label="Total deducido" />
            <Stat icono={Wallet} color="emerald" valor={fmtCOP(totales.neto)} label="Neto a pagar" className="col-span-2 sm:col-span-1" />
          </div>

          {puedeOperar && (
            <LineaNovedades
              colaboradores={periodo.liquidaciones.length}
              comisiones={comisiones.length}
              totalComisiones={comisiones.reduce((t, c) => t + Number(c.valor), 0)}
              horas={novedadesHoras.reduce((t, h) => t + Number(h.horas), 0)}
              conceptos={novedadesConcepto}
              editable={periodo.estado === 'CALCULADA'}
            />
          )}
          {periodo.estado === 'CERRADA' && <p className="mb-3 text-xs text-muted-foreground">Periodo cerrado. Reábrelo desde el menú para corregirlo, o usa un periodo de ajuste.</p>}
          {periodo.estado === 'PAGADA' && <p className="mb-3 text-xs text-muted-foreground">Periodo pagado: ya no cambia. Para corregir, usa un periodo de ajuste.</p>}

          {/* Celular: una tarjeta por persona con el neto a la vista; la tabla no cabía. */}
          <Card className="sm:hidden"><CardContent className="divide-y p-0">
            {filas.map((l) => (
              <div key={l.id} className="flex items-start gap-2 p-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/colaboradores/${l.colaboradorId}`} className="block truncate text-sm font-medium hover:underline">{l.nombre}</Link>
                  <p className="text-xs text-muted-foreground">
                    Devengado {fmtCOP(l.devengado)} · deducido {fmtCOP(l.deducido)}{l.horasExtra > 0 ? ` · horas extra ${fmtCOP(l.horasExtra)}` : ''}
                  </p>
                  {!l.cuenta && <p className="text-xs font-medium text-amber-600 dark:text-amber-400">Sin cuenta registrada</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-sm font-semibold tabular-nums">{fmtCOP(l.neto)}</span>
                  <AccionesFila l={l} puedeOperar={puedeOperar} />
                </div>
              </div>
            ))}
          </CardContent></Card>

          <Card className="hidden sm:block"><CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="p-3 text-left font-medium">Colaborador</th>
                  <th className="p-3 text-right font-medium">Horas extra</th>
                  <th className="p-3 text-right font-medium">Devengado</th>
                  <th className="p-3 text-right font-medium">Deducido</th>
                  <th className="p-3 text-right font-medium">Neto</th>
                  <th className="p-3 text-left font-medium hidden md:table-cell">Cuenta de pago</th>
                  <th className="p-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {filas.map((l) => (
                  <tr key={l.id} className="border-t">
                    <td className="p-3">
                      <Link href={`/colaboradores/${l.colaboradorId}`} className="hover:underline">{l.nombre}</Link>
                      <p className="text-xs text-muted-foreground">{l.documento}</p>
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {l.horasExtra > 0 ? fmtCOP(l.horasExtra) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="p-3 text-right tabular-nums">{fmtCOP(l.devengado)}</td>
                    <td className="p-3 text-right tabular-nums">{fmtCOP(l.deducido)}</td>
                    <td className="p-3 text-right tabular-nums font-medium">{fmtCOP(l.neto)}</td>
                    <td className="p-3 hidden md:table-cell">
                      {l.cuenta
                        ? <span className="text-xs"><span className="font-medium">{l.cuenta.banco}</span><span className="text-muted-foreground"> · {l.cuenta.tipo} · {l.cuenta.numero}</span></span>
                        : <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Sin cuenta registrada</span>}
                    </td>
                    <td className="p-3"><AccionesFila l={l} puedeOperar={puedeOperar} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent></Card>
        </>
      )}
    </div>
  )
}

type Fila = {
  id: string; colaboradorId: string; nombre: string; documento: string
  horasExtra: number; devengado: number; deducido: number; neto: number
  cuenta: { banco: string; tipo: string; numero: string } | null
  documentoId: string | null
}

/** Ver el desprendible y, para quien opera la nómina, rehacerlo o reemplazarlo. */
function AccionesFila({ l, puedeOperar }: { l: Fila; puedeOperar: boolean }) {
  return (
    <div className="flex items-center gap-1">
      {l.documentoId && (
        <VisorPdf documentoId={l.documentoId} titulo={`Desprendible · ${l.nombre}`} mimeType="application/pdf" className={buttonVariants({ variant: 'ghost', size: 'icon' })}>
          <Eye className="size-4" /><span className="sr-only">Ver desprendible</span>
        </VisorPdf>
      )}
      {/* Si el desprendible generado no sirve, se sube el correcto. */}
      {puedeOperar && (
        <AdjuntarDocumento
          destino="desprendible" id={l.id} tamano="icon" variante="ghost"
          tieneDocumento={Boolean(l.documentoId)}
          etiqueta={l.documentoId ? 'Rehacer o reemplazar el desprendible' : 'Generar o subir el desprendible'}
        />
      )}
    </div>
  )
}

/**
 * Lo que entró en este periodo, en una línea sobre la tabla: cuántos se
 * liquidaron y qué novedades recogió. Registrarlas se hace en Novedades, fuera
 * de todo periodo; si falta alguna, se registra allá y se recalcula aquí.
 */
function LineaNovedades({ colaboradores, comisiones, totalComisiones, horas, conceptos, editable }: {
  colaboradores: number
  comisiones: number
  totalComisiones: number
  horas: number
  conceptos: number
  editable: boolean
}) {
  const partes = [
    `${colaboradores} colaborador${colaboradores === 1 ? '' : 'es'}`,
    comisiones > 0 ? `${comisiones} comisi${comisiones === 1 ? 'ón' : 'ones'} · ${fmtCOP(totalComisiones)}` : null,
    horas > 0 ? `${horas.toLocaleString('es-CO', { maximumFractionDigits: 2 })} h extra y recargos` : null,
    conceptos > 0 ? `${conceptos} otro${conceptos === 1 ? '' : 's'} concepto${conceptos === 1 ? '' : 's'}` : null,
  ].filter(Boolean)
  return (
    <div className="my-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
      <p className="text-muted-foreground">
        {partes.join(' · ')}
        {comisiones === 0 && horas === 0 && conceptos === 0 && ' · sin novedades'}
      </p>
      {editable && (
        <Link href="/nomina/novedades" className="text-xs font-medium text-primary hover:underline">
          Registrar novedades →
        </Link>
      )}
    </div>
  )
}
