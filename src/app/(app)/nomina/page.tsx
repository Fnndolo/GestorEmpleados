import Link from 'next/link'
import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Wallet, ChevronRight, HandCoins, Receipt, Coins } from 'lucide-react'
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
    <div className="max-w-6xl">
      <Encabezado
        volver
        enLinea
        titulo="Nómina"
        // En el celular los botones son solo íconos, en la misma fila del título.
        acciones={
          <div className="flex gap-2">
            {/* Antes del periodo: las comisiones y horas se registran cuando
                ocurren, no cuando alguien abre la nómina del mes. */}
            {puedeCrear && (
              <Button size="sm" asChild>
                <Link href="/nomina/novedades" aria-label="Novedades" title="Novedades"><Coins className="size-4" /> <span className="hidden sm:inline">Novedades</span></Link>
              </Button>
            )}
            <Button size="sm" asChild>
              <Link href="/nomina/ops" aria-label="Pagos OPS" title="Pagos OPS"><Receipt className="size-4" /> <span className="hidden sm:inline">Pagos OPS</span></Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/nomina/prestamos" aria-label="Préstamos" title="Préstamos"><HandCoins className="size-4" /> <span className="hidden sm:inline">Préstamos</span></Link>
            </Button>
            {puedeCrear && <CrearPeriodo />}
          </div>
        }
      />

      {periodos.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
          <Wallet className="size-8" />
          <p>Aún no hay periodos de nómina.</p>
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
