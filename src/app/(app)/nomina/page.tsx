import Link from 'next/link'
import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Wallet, ChevronRight, HandCoins, Receipt } from 'lucide-react'
import { Chip, Pill, type PillTone } from '@/components/ui-kit'
import { CrearPeriodo } from './crear-periodo'

export const metadata = { title: 'Nómina · Smart Gadgets RH' }

const ESTADO: Record<string, string> = { BORRADOR: 'Borrador', CALCULADA: 'Calculada', APROBADA: 'Aprobada', CERRADA: 'Cerrada', PAGADA: 'Pagada' }
const TONO: Record<string, PillTone> = { BORRADOR: 'muted', CALCULADA: 'info', APROBADA: 'warn', CERRADA: 'ok', PAGADA: 'ok' }

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
              <Link href="/nomina/ops"><Receipt className="size-4" /> Pagos OPS</Link>
            </Button>
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
            <Link key={p.id} href={`/nomina/${p.id}`} className="flex items-center gap-3 p-3 transition-colors hover:bg-accent/40">
              <Chip icono={Wallet} color="emerald" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.nombre}{p.esAjuste && ' (ajuste)'}</p>
                <p className="text-xs text-muted-foreground">{p._count.liquidaciones} liquidación(es)</p>
              </div>
              <Pill tone={TONO[p.estado] ?? 'muted'}>{ESTADO[p.estado]}</Pill>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </CardContent></Card>
      )}
    </div>
  )
}
