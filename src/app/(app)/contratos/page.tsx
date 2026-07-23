import Link from 'next/link'
import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { sedeActualId } from '@/server/sede-actual'
import { Encabezado } from '@/components/shell/encabezado'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Plus, FileText, ChevronRight, FileExclamationPoint, Receipt } from 'lucide-react'
import { Chip, Pill, type PillTone } from '@/components/ui-kit'
import { colorAvatar, iniciales } from '@/lib/etiquetas'
import { FiltroTabs } from '@/components/shell/filtro-tabs'
import { formatFechaCorta } from '@/lib/fechas'
import { fmtCOP } from '@/lib/moneda'

export const metadata = { title: 'Contratación · Smart Gadgets RH' }

const TONO_CONTRATO: Record<string, PillTone> = {
  ACTIVO: 'ok', BORRADOR: 'warn', SUSPENDIDO: 'bad', TERMINADO: 'muted',
}

function AvatarColab({ c }: { c: { id: string; nombres: string; apellidos: string; fotoPath: string | null } }) {
  return (
    <Avatar className="size-8 shrink-0">
      {c.fotoPath && <AvatarImage src={`/api/documentos/foto/${c.id}`} alt="" />}
      <AvatarFallback className="text-[10px] font-semibold text-white" style={{ backgroundColor: colorAvatar(`${c.nombres} ${c.apellidos}`) }}>
        {iniciales(c.nombres, c.apellidos)}
      </AvatarFallback>
    </Avatar>
  )
}

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
    where: { contratoOpsId: { not: null }, estado: { in: ['RADICADA', 'EN_VERIFICACION_SS', 'BLOQUEADA_SS'] }, soporteSs: { is: null } },
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
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link href="/contratos/cuentas-cobro"><Receipt className="size-4" /> Cuentas de cobro</Link>
            </Button>
            {puedeCrear && (
              <>
                <Button size="sm" variant="outline" asChild>
                  <Link href="/contratos/ops/nuevo"><Plus className="size-4" /> OPS</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link href="/contratos/nuevo"><Plus className="size-4" /> Contrato</Link>
                </Button>
              </>
            )}
          </div>
        }
      />

      {cuentasSinSoporte > 0 && (
        <Link
          href="/contratos/cuentas-riesgo"
          className="mb-4 flex items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-3 transition-colors hover:bg-amber-500/10"
        >
          <Chip icono={FileExclamationPoint} color="amber" className="size-9 rounded-[10px]" iconClassName="size-[18px]" />
          <p className="min-w-0 flex-1 text-sm">
            <b>{cuentasSinSoporte}</b> cuenta(s) de cobro OPS sin soporte de seguridad social (riesgo de pago).
          </p>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      )}

      {/* Pestañas (móvil: desplegable) */}
      <div className="mb-4">
        <FiltroTabs tabs={TABS} activo={tab} basePath="/contratos" />
      </div>

      {esOps ? (
        contratosOps.length === 0 ? <Vacio /> : (
          <Card><CardContent className="p-0 divide-y">
            {contratosOps.map((c) => (
              <Link key={c.id} href={`/contratos/ops/${c.id}`} className="flex items-center gap-3 p-3 transition-colors hover:bg-accent/40">
                <Chip icono={Receipt} color="teal" />
                <AvatarColab c={c.colaborador} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.colaborador.nombres} {c.colaborador.apellidos}</p>
                  <p className="truncate text-xs text-muted-foreground">{c.numero} · {c.objeto}</p>
                </div>
                <div className="hidden text-right sm:block">
                  <p className="text-sm font-medium tabular-nums">{fmtCOP(Number(c.valorTotal))}</p>
                  <p className="text-xs text-muted-foreground">{c._count.cuentasCobro} cuenta(s)</p>
                </div>
                <Pill tone={TONO_CONTRATO[c.estado] ?? 'muted'}>{ESTADO_CONTRATO[c.estado] ?? c.estado}</Pill>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </CardContent></Card>
        )
      ) : (
        contratosLaboral.length === 0 ? <Vacio /> : (
          <Card><CardContent className="p-0 divide-y">
            {contratosLaboral.map((c) => (
              <Link key={c.id} href={`/contratos/${c.id}`} className="flex items-center gap-3 p-3 transition-colors hover:bg-accent/40">
                <Chip icono={FileText} color="indigo" />
                <AvatarColab c={c.colaborador} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.colaborador.nombres} {c.colaborador.apellidos}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.numero} · {c.cargo?.nombre ?? 'Sin cargo'}
                    {c.fechaFin && ` · vence ${formatFechaCorta(c.fechaFin)}`}
                  </p>
                </div>
                <span className="hidden text-sm font-medium tabular-nums sm:block">{fmtCOP(Number(c.salarioBase))}</span>
                <Pill tone={TONO_CONTRATO[c.estado] ?? 'muted'}>{ESTADO_CONTRATO[c.estado]}</Pill>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
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
