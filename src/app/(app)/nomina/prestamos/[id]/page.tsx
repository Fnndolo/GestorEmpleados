import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ArrowLeft, Check, Clock, Download } from 'lucide-react'
import { fmtCOP } from '@/lib/moneda'
import { formatFechaCorta } from '@/lib/fechas'
import { PazSalvoBoton } from './paz-salvo-boton'

export const metadata = { title: 'Detalle de préstamo · Smart Gadgets RH' }

export default async function PrestamoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const usuario = await requerirPermiso('nomina', 'VER')
  const puedeExportar = tienePermiso(usuario, 'nomina', 'EXPORTAR')

  const prestamo = await prisma.prestamo.findUnique({
    where: { id },
    include: {
      colaborador: { select: { id: true, nombres: true, apellidos: true } },
      cuotas: { orderBy: { numero: 'asc' } },
    },
  })
  if (!prestamo) notFound()

  const pagadas = prestamo.cuotas.filter((c) => c.pagada).length
  const faltantes = prestamo.numeroCuotas - pagadas
  const pct = prestamo.numeroCuotas > 0 ? Math.round((pagadas / prestamo.numeroCuotas) * 100) : 0
  const pazSalvo = prestamo.estado === 'PAGADO'
    ? await prisma.documento.findFirst({ where: { entidadTipo: 'Prestamo', entidadId: prestamo.id }, orderBy: { creadoEn: 'desc' } })
    : null

  return (
    <div className="mx-auto max-w-2xl">
      <Encabezado
        titulo={`Préstamo · ${prestamo.colaborador.nombres} ${prestamo.colaborador.apellidos}`}
        descripcion={prestamo.descripcion ?? 'Detalle de cuotas y saldo.'}
        acciones={
          <Button variant="outline" size="sm" asChild>
            <Link href="/nomina/prestamos"><ArrowLeft className="size-4" /> Volver</Link>
          </Button>
        }
      />

      <Card className="mb-4"><CardContent className="py-5 space-y-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Dato label="Valor total" valor={fmtCOP(Number(prestamo.valorTotal))} />
          <Dato label="Cuota" valor={fmtCOP(Number(prestamo.valorCuota))} />
          <Dato label="Saldo" valor={fmtCOP(Number(prestamo.saldo))} />
          <div>
            <p className="text-xs text-muted-foreground">Estado</p>
            <Badge variant={prestamo.estado === 'PAGADO' ? 'default' : 'secondary'}>{prestamo.estado}</Badge>
          </div>
        </div>
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span>{pagadas} de {prestamo.numeroCuotas} cuotas pagadas</span>
            <span className="text-muted-foreground">{faltantes} por pagar</span>
          </div>
          <Progress value={pct} />
        </div>
        {prestamo.estado === 'PAGADO' && (
          <div className="flex items-center gap-2 pt-1">
            {pazSalvo ? (
              <Button size="sm" variant="outline" asChild>
                <a href={`/api/documentos/${pazSalvo.id}`} target="_blank" rel="noreferrer"><Download className="size-4" /> Ver paz y salvo</a>
              </Button>
            ) : puedeExportar ? (
              <PazSalvoBoton prestamoId={prestamo.id} />
            ) : null}
          </div>
        )}
      </CardContent></Card>

      <Card><CardContent className="p-0 divide-y">
        {prestamo.cuotas.map((c) => (
          <div key={c.id} className="flex items-center gap-3 p-3">
            <div className={`flex size-8 shrink-0 items-center justify-center rounded-full ${c.pagada ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
              {c.pagada ? <Check className="size-4" /> : <Clock className="size-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Cuota {c.numero}</p>
              <p className="text-xs text-muted-foreground">
                {c.pagada ? `Pagada${c.fechaPago ? ` · ${formatFechaCorta(c.fechaPago)}` : ''}` : 'Pendiente'}
              </p>
            </div>
            <p className="text-sm tabular-nums">{fmtCOP(Number(c.valor))}</p>
          </div>
        ))}
      </CardContent></Card>
    </div>
  )
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{valor}</p>
    </div>
  )
}
