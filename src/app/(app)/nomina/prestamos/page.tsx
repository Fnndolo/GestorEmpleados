import Link from 'next/link'
import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronRight } from 'lucide-react'
import { fmtCOP } from '@/lib/moneda'
import { PrestamosCliente } from './prestamos-cliente'

export const metadata = { title: 'Préstamos · Smart Gadgets RH' }

export default async function PrestamosPage() {
  const usuario = await requerirPermiso('nomina', 'VER')
  const puedeCrear = tienePermiso(usuario, 'nomina', 'CREAR')

  const prestamos = await prisma.prestamo.findMany({
    include: { colaborador: { select: { nombres: true, apellidos: true } } },
    orderBy: { creadoEn: 'desc' },
    take: 100,
  })

  return (
    <div className="mx-auto max-w-4xl">
      <Encabezado titulo="Préstamos y descuentos" descripcion="Control de cuotas y saldo. Las cuotas se descuentan automáticamente al cerrar la nómina." />
      <PrestamosCliente puedeCrear={puedeCrear} />
      <Card className="mt-4"><CardContent className="p-0 divide-y">
        {prestamos.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Sin préstamos registrados.</p>
        ) : prestamos.map((p) => (
          <Link key={p.id} href={`/nomina/prestamos/${p.id}`} className="flex items-center gap-3 p-3 hover:bg-accent/40 transition-colors">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{p.colaborador.nombres} {p.colaborador.apellidos}</p>
              <p className="text-xs text-muted-foreground">{fmtCOP(Number(p.valorTotal))} en {p.numeroCuotas} cuotas de {fmtCOP(Number(p.valorCuota))}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium">Saldo: {fmtCOP(Number(p.saldo))}</p>
            </div>
            <Badge variant={p.estado === 'PAGADO' ? 'default' : 'secondary'}>{p.estado}</Badge>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        ))}
      </CardContent></Card>
    </div>
  )
}
