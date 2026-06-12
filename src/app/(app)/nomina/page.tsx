import Link from 'next/link'
import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Wallet, ChevronRight, HandCoins } from 'lucide-react'
import { CrearPeriodo } from './crear-periodo'

export const metadata = { title: 'Nómina · Smart Gadgets RH' }

const ESTADO: Record<string, string> = { BORRADOR: 'Borrador', CALCULADA: 'Calculada', APROBADA: 'Aprobada', CERRADA: 'Cerrada', PAGADA: 'Pagada' }

export default async function NominaPage() {
  const usuario = await requerirPermiso('nomina', 'VER')
  const puedeCrear = tienePermiso(usuario, 'nomina', 'CREAR')

  const periodos = await prisma.periodoNomina.findMany({
    orderBy: [{ anio: 'desc' }, { mes: 'desc' }, { quincena: 'desc' }],
    include: { _count: { select: { liquidaciones: true } } },
    take: 50,
  })

  return (
    <div className="mx-auto max-w-4xl">
      <Encabezado
        titulo="Nómina"
        descripcion="Liquidación de nómina con conceptos, comisiones, horas extra (Ley 2466) y desprendibles."
        acciones={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/nomina/prestamos"><HandCoins className="size-4" /> Préstamos</Link>
            </Button>
            {puedeCrear && <CrearPeriodo />}
          </div>
        }
      />

      {periodos.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
          <Wallet className="size-8" />
          <p>Aún no hay periodos de nómina. Crea el primero.</p>
        </CardContent></Card>
      ) : (
        <Card><CardContent className="p-0 divide-y">
          {periodos.map((p) => (
            <Link key={p.id} href={`/nomina/${p.id}`} className="flex items-center gap-3 p-3 hover:bg-accent/40">
              <Wallet className="size-5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{p.nombre}{p.esAjuste && ' (ajuste)'}</p>
                <p className="text-xs text-muted-foreground">{p._count.liquidaciones} liquidación(es)</p>
              </div>
              <Badge variant={p.estado === 'CERRADA' || p.estado === 'PAGADA' ? 'default' : p.estado === 'BORRADOR' ? 'secondary' : 'outline'}>
                {ESTADO[p.estado]}
              </Badge>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          ))}
        </CardContent></Card>
      )}
    </div>
  )
}
