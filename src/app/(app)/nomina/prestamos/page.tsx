import Link from 'next/link'
import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { ChevronRight } from 'lucide-react'
import { Pill, AvatarColaborador } from '@/components/ui-kit'
import { fmtCOP } from '@/lib/moneda'
import { urlFoto } from '@/lib/foto'
import { mesLargo } from '@/lib/descuentos'
import { PrestamosCliente } from './prestamos-cliente'

export const metadata = { title: 'Descuentos · Smart Gadgets RH' }

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
      <Encabezado
        volver enLinea titulo="Descuentos"
        ayuda="Préstamos, anticipos y otros descuentos de nómina. Las cuotas se descuentan al liquidar la nómina desde el mes indicado; si el acuerdo de pago debe firmarse, solo después de que el colaborador lo firme."
        acciones={<PrestamosCliente puedeCrear={puedeCrear} />}
      />
      <Card className="mt-4"><CardContent className="p-0 divide-y">
        {prestamos.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Sin descuentos registrados.</p>
        ) : prestamos.map((p) => {
          const porFirmar = p.requiereFirma && !!p.acuerdoDocId && !p.firmaEmpleadoFecha
          return (
            <Link key={p.id} href={`/nomina/prestamos/${p.id}`} className="flex flex-wrap items-center gap-3 p-3 transition-colors hover:bg-accent/40">
              <AvatarColaborador
                nombre={`${p.colaborador.nombres} ${p.colaborador.apellidos}`}
                fotoUrl={urlFoto(p.colaborador.id, p.colaborador.fotoPath, true)}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.colaborador.nombres} {p.colaborador.apellidos}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {p.descripcion ? `${p.descripcion} · ` : ''}{fmtCOP(Number(p.valorTotal))} en {p.numeroCuotas} cuotas de {fmtCOP(Number(p.valorCuota))} · desde {mesLargo(p.fechaInicio)}
                </p>
              </div>
              <p className="hidden text-sm font-medium tabular-nums sm:block">Saldo: {fmtCOP(Number(p.saldo))}</p>
              {porFirmar && <Pill tone="warn">Acuerdo por firmar</Pill>}
              <Pill tone={p.estado === 'PAGADO' ? 'ok' : 'info'}>{p.estado === 'PAGADO' ? 'Pagado' : 'Activo'}</Pill>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          )
        })}
      </CardContent></Card>
    </div>
  )
}
