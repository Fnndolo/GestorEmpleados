import Link from 'next/link'
import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { ChevronRight } from 'lucide-react'
import { Pill, AvatarColaborador } from '@/components/ui-kit'
import { fmtCOP } from '@/lib/moneda'
import { urlFoto } from '@/lib/foto'
import { PrestamosCliente } from './prestamos-cliente'

export const metadata = { title: 'Préstamos · Smart Gadgets RH' }

export default async function PrestamosPage() {
  const usuario = await requerirPermiso('nomina', 'VER')
  const puedeCrear = tienePermiso(usuario, 'nomina', 'CREAR')

  const prestamos = await prisma.prestamo.findMany({
    include: { colaborador: { select: { id: true, nombres: true, apellidos: true, fotoPath: true } } },
    orderBy: { creadoEn: 'desc' },
    take: 100,
  })

  return (
    <div className="max-w-6xl">
      <Encabezado titulo="Préstamos y descuentos" descripcion="Control de cuotas y saldo. Las cuotas se descuentan automáticamente al cerrar la nómina." />
      <PrestamosCliente puedeCrear={puedeCrear} />
      <Card className="mt-4"><CardContent className="p-0 divide-y">
        {prestamos.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Sin préstamos registrados.</p>
        ) : prestamos.map((p) => (
          <Link key={p.id} href={`/nomina/prestamos/${p.id}`} className="flex flex-wrap items-center gap-3 p-3 transition-colors hover:bg-accent/40">
            <AvatarColaborador
              nombre={`${p.colaborador.nombres} ${p.colaborador.apellidos}`}
              fotoUrl={urlFoto(p.colaborador.id, p.colaborador.fotoPath, true)}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{p.colaborador.nombres} {p.colaborador.apellidos}</p>
              <p className="text-xs text-muted-foreground">{fmtCOP(Number(p.valorTotal))} en {p.numeroCuotas} cuotas de {fmtCOP(Number(p.valorCuota))}</p>
            </div>
            <p className="hidden text-sm font-medium tabular-nums sm:block">Saldo: {fmtCOP(Number(p.saldo))}</p>
            <Pill tone={p.estado === 'PAGADO' ? 'ok' : 'warn'}>{p.estado === 'PAGADO' ? 'Pagado' : 'Activo'}</Pill>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </CardContent></Card>
    </div>
  )
}
