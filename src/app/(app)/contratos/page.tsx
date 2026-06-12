import Link from 'next/link'
import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { sedeActualId } from '@/server/sede-actual'
import { Encabezado } from '@/components/shell/encabezado'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, FileText, ChevronRight, FileWarning } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatFechaCorta } from '@/lib/fechas'
import { fmtCOP } from '@/lib/moneda'

export const metadata = { title: 'Contratación · Smart Gadgets RH' }

const TABS = [
  { valor: 'OPS', label: 'OPS' },
  { valor: 'TERMINO_FIJO', label: 'Término fijo' },
  { valor: 'TERMINO_INDEFINIDO', label: 'Indefinido' },
  { valor: 'OBRA_LABOR', label: 'Obra/labor' },
  { valor: 'APRENDIZAJE_SENA', label: 'Aprendizaje' },
]

const ESTADO_CONTRATO: Record<string, string> = {
  BORRADOR: 'Borrador', ACTIVO: 'Activo', SUSPENDIDO: 'Suspendido', TERMINADO: 'Terminado',
}

export default async function ContratosPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const usuario = await requerirPermiso('contratos', 'VER')
  const { tab = 'TERMINO_INDEFINIDO' } = await searchParams
  const puedeCrear = tienePermiso(usuario, 'contratos', 'CREAR')
  const sede = await sedeActualId()
  const esOps = tab === 'OPS'

  const cuentasSinSoporte = await prisma.cuentaCobroOps.count({
    where: { estado: { in: ['RADICADA', 'EN_VERIFICACION_SS', 'BLOQUEADA_SS'] }, soporteSs: { is: null } },
  })

  const contratosLaboral = esOps ? [] : await prisma.contrato.findMany({
    where: { tipo: tab as 'TERMINO_FIJO', ...(sede ? { sedeId: sede } : {}) },
    include: { colaborador: true, cargo: true, sede: true },
    orderBy: { creadoEn: 'desc' },
    take: 200,
  })

  const contratosOps = esOps ? await prisma.contratoOps.findMany({
    where: { ...(sede ? { sedeId: sede } : {}) },
    include: { colaborador: true, sede: true, _count: { select: { cuentasCobro: true } } },
    orderBy: { creadoEn: 'desc' },
    take: 200,
  }) : []

  return (
    <div className="mx-auto max-w-5xl">
      <Encabezado
        titulo="Contratación y vinculación"
        descripcion="Contratos laborales por modalidad y contratos de prestación de servicios (OPS)."
        acciones={
          puedeCrear && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" asChild>
                <Link href="/contratos/ops/nuevo"><Plus className="size-4" /> OPS</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/contratos/nuevo"><Plus className="size-4" /> Contrato</Link>
              </Button>
            </div>
          )
        }
      />

      {cuentasSinSoporte > 0 && (
        <Link href="/contratos/cuentas-riesgo">
          <Card className="mb-4 border-amber-300 bg-amber-50/50">
            <CardContent className="flex items-center gap-3 py-3">
              <FileWarning className="size-5 text-amber-600" />
              <p className="text-sm flex-1">
                <b>{cuentasSinSoporte}</b> cuenta(s) de cobro OPS sin soporte de seguridad social (riesgo de pago).
              </p>
              <ChevronRight className="size-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      )}

      {/* Pestañas */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-4">
        {TABS.map((t) => (
          <Link
            key={t.valor}
            href={`/contratos?tab=${t.valor}`}
            className={cn(
              'whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
              tab === t.valor ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent',
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {esOps ? (
        contratosOps.length === 0 ? <Vacio /> : (
          <Card><CardContent className="p-0 divide-y">
            {contratosOps.map((c) => (
              <Link key={c.id} href={`/contratos/ops/${c.id}`} className="flex items-center gap-3 p-3 hover:bg-accent/40">
                <FileText className="size-5 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{c.colaborador.nombres} {c.colaborador.apellidos}</p>
                  <p className="text-xs text-muted-foreground truncate">{c.numero} · {c.objeto}</p>
                </div>
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium">{fmtCOP(Number(c.valorTotal))}</p>
                  <p className="text-xs text-muted-foreground">{c._count.cuentasCobro} cuenta(s)</p>
                </div>
                <Badge variant={c.estado === 'ACTIVO' ? 'default' : 'secondary'}>{c.estado}</Badge>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            ))}
          </CardContent></Card>
        )
      ) : (
        contratosLaboral.length === 0 ? <Vacio /> : (
          <Card><CardContent className="p-0 divide-y">
            {contratosLaboral.map((c) => (
              <Link key={c.id} href={`/contratos/${c.id}`} className="flex items-center gap-3 p-3 hover:bg-accent/40">
                <FileText className="size-5 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{c.colaborador.nombres} {c.colaborador.apellidos}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {c.numero} · {c.cargo?.nombre ?? 'Sin cargo'}
                    {c.fechaFin && ` · vence ${formatFechaCorta(c.fechaFin)}`}
                  </p>
                </div>
                <span className="text-sm font-medium hidden sm:block">{fmtCOP(Number(c.salarioBase))}</span>
                <Badge variant={c.estado === 'ACTIVO' ? 'default' : c.estado === 'SUSPENDIDO' ? 'destructive' : 'secondary'}>
                  {ESTADO_CONTRATO[c.estado]}
                </Badge>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            ))}
          </CardContent></Card>
        )
      )}
    </div>
  )
}

function Vacio() {
  return (
    <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
      <FileText className="size-8" />
      <p>No hay contratos en esta categoría.</p>
    </CardContent></Card>
  )
}
