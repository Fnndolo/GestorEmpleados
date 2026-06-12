import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatFechaLarga } from '@/lib/fechas'
import { EtapasDisciplinario } from './etapas'

export const metadata = { title: 'Proceso disciplinario · Smart Gadgets RH' }

const ETAPA: Record<string, string> = { CITACION_DESCARGOS: 'Citación a descargos', DESCARGOS: 'Descargos', DECISION: 'Decisión', RECURSO: 'Recurso', CERRADO: 'Cerrado' }

export default async function DisciplinarioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const usuario = await requerirPermiso('juridica', 'VER')
  const puedeEditar = tienePermiso(usuario, 'juridica', 'EDITAR')

  const p = await prisma.procesoDisciplinario.findUnique({
    where: { id },
    include: { colaborador: { select: { id: true, nombres: true, apellidos: true } }, etapas: { orderBy: { fecha: 'asc' } } },
  })
  if (!p) notFound()

  return (
    <div className="mx-auto max-w-3xl">
      <Encabezado
        titulo={p.asunto}
        descripcion={`${p.colaborador.nombres} ${p.colaborador.apellidos} · abierto ${formatFechaLarga(p.fechaApertura)}`}
        acciones={<Badge variant={p.cerrado ? 'secondary' : 'default'}>{ETAPA[p.etapa]}</Badge>}
      />
      <p className="mb-4"><Link href={`/colaboradores/${p.colaborador.id}`} className="text-sm text-primary hover:underline">Ver ficha →</Link></p>
      {p.descripcion && <Card className="mb-4"><CardContent className="py-3 text-sm text-muted-foreground">{p.descripcion}</CardContent></Card>}

      {/* Línea de tiempo de etapas */}
      {p.etapas.length > 0 && (
        <Card className="mb-4"><CardContent className="py-4">
          <h3 className="text-sm font-medium mb-3">Actuaciones</h3>
          <ol className="space-y-3 border-l pl-4">
            {p.etapas.map((e) => (
              <li key={e.id} className="relative">
                <span className="absolute -left-[21px] top-1 size-2.5 rounded-full bg-primary" />
                <p className="text-sm font-medium">{ETAPA[e.etapa]}</p>
                <p className="text-xs text-muted-foreground">{formatFechaLarga(e.fecha)}{e.detalle ? ` · ${e.detalle}` : ''}</p>
              </li>
            ))}
          </ol>
        </CardContent></Card>
      )}

      {puedeEditar && !p.cerrado && <EtapasDisciplinario procesoId={p.id} etapaActual={p.etapa} />}
    </div>
  )
}
