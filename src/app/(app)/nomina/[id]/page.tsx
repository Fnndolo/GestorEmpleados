import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fmtCOP } from '@/lib/moneda'
import { AccionesPeriodo } from './acciones-cliente'

export const metadata = { title: 'Periodo de nómina · Smart Gadgets RH' }

const ESTADO: Record<string, string> = { BORRADOR: 'Borrador', CALCULADA: 'Calculada', APROBADA: 'Aprobada', CERRADA: 'Cerrada', PAGADA: 'Pagada' }

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
        include: { colaborador: { select: { nombres: true, apellidos: true, numeroDocumento: true } } },
        orderBy: { colaborador: { apellidos: 'asc' } },
      },
    },
  })
  if (!periodo) notFound()

  const totales = periodo.liquidaciones.reduce(
    (acc, l) => ({
      devengado: acc.devengado + Number(l.totalDevengado),
      deducido: acc.deducido + Number(l.totalDeducido),
      neto: acc.neto + Number(l.neto),
    }),
    { devengado: 0, deducido: 0, neto: 0 },
  )

  return (
    <div className="mx-auto max-w-5xl">
      <Encabezado
        titulo={periodo.nombre}
        descripcion={`Periodo ${periodo.tipo === 'QUINCENAL' ? 'quincenal' : 'mensual'} · ${periodo.diasPeriodo} días`}
        acciones={<Badge variant={periodo.estado === 'CERRADA' || periodo.estado === 'PAGADA' ? 'default' : 'outline'}>{ESTADO[periodo.estado]}</Badge>}
      />

      <AccionesPeriodo
        periodoId={periodo.id}
        estado={periodo.estado}
        tieneLiquidaciones={periodo.liquidaciones.length > 0}
        puedeOperar={puedeOperar}
        puedeAprobar={puedeAprobar}
        puedeExportar={puedeExportar}
      />

      {periodo.liquidaciones.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-3 my-4">
            <Card><CardContent className="py-4"><p className="text-xl font-semibold tabular-nums">{fmtCOP(totales.devengado)}</p><p className="text-xs text-muted-foreground">Total devengado</p></CardContent></Card>
            <Card><CardContent className="py-4"><p className="text-xl font-semibold tabular-nums">{fmtCOP(totales.deducido)}</p><p className="text-xs text-muted-foreground">Total deducido</p></CardContent></Card>
            <Card><CardContent className="py-4"><p className="text-xl font-semibold tabular-nums text-emerald-600">{fmtCOP(totales.neto)}</p><p className="text-xs text-muted-foreground">Neto a pagar</p></CardContent></Card>
          </div>

          <Card><CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="p-3 text-left font-medium">Colaborador</th>
                  <th className="p-3 text-right font-medium">Devengado</th>
                  <th className="p-3 text-right font-medium hidden sm:table-cell">Deducido</th>
                  <th className="p-3 text-right font-medium">Neto</th>
                  <th className="p-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {periodo.liquidaciones.map((l) => (
                  <tr key={l.id} className="border-t">
                    <td className="p-3">
                      <Link href={`/colaboradores/${l.colaboradorId}`} className="hover:underline">{l.colaborador.nombres} {l.colaborador.apellidos}</Link>
                      <p className="text-xs text-muted-foreground">{l.colaborador.numeroDocumento}</p>
                    </td>
                    <td className="p-3 text-right tabular-nums">{fmtCOP(Number(l.totalDevengado))}</td>
                    <td className="p-3 text-right tabular-nums hidden sm:table-cell">{fmtCOP(Number(l.totalDeducido))}</td>
                    <td className="p-3 text-right tabular-nums font-medium">{fmtCOP(Number(l.neto))}</td>
                    <td className="p-3">
                      {l.documentoId && (
                        <Button variant="ghost" size="icon" asChild aria-label="Desprendible">
                          <a href={`/api/documentos/${l.documentoId}`} target="_blank" rel="noreferrer"><Download className="size-4" /></a>
                        </Button>
                      )}
                    </td>
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
