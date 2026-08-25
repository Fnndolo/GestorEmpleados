import { notFound } from 'next/navigation'
import Link from 'next/link'
import { FileText } from 'lucide-react'
import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatFechaLarga, hoyBogota } from '@/lib/fechas'
import { SoportesLista, type SoporteDoc } from '../../_ui'
import { AccionesDisciplinario } from './acciones-disciplinario'

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

  // Soportes anclados a cada etapa (inmutables)
  const etapaIds = p.etapas.map((e) => e.id)
  const docsEtapa = await prisma.documento.findMany({
    where: { entidadTipo: 'EtapaProceso', entidadId: { in: etapaIds } },
    orderBy: { creadoEn: 'asc' },
    select: { id: true, nombre: true, mimeType: true, entidadId: true },
  })
  const porEtapa = new Map<string, SoporteDoc[]>()
  for (const d of docsEtapa) {
    const arr = porEtapa.get(d.entidadId) ?? []
    arr.push({ id: d.id, nombre: d.nombre, mimeType: d.mimeType })
    porEtapa.set(d.entidadId, arr)
  }
  const acta = p.documentoActaId ? await prisma.documento.findUnique({ where: { id: p.documentoActaId }, select: { id: true, nombre: true } }) : null

  return (
    <div className="max-w-5xl">
      <Encabezado
        titulo={p.asunto}
        descripcion={`${p.colaborador.nombres} ${p.colaborador.apellidos} · abierto ${formatFechaLarga(p.fechaApertura)}`}
        acciones={<Badge variant={p.cerrado ? 'secondary' : 'default'}>{ETAPA[p.etapa]}</Badge>}
      />
      <p className="mb-4"><Link href={`/colaboradores/${p.colaborador.id}`} className="text-sm text-primary hover:underline">Ver ficha →</Link></p>

      {p.descripcion && <Card className="mb-4"><CardContent className="py-3 text-sm text-muted-foreground">{p.descripcion}</CardContent></Card>}

      {/* Plazo vigente (5 días hábiles) */}
      {!p.cerrado && p.fechaLimite && (
        <Card className="mb-4 border-amber-300 bg-amber-50/50 dark:bg-amber-950/20"><CardContent className="py-3 text-sm">
          <b>Plazo {p.etapa === 'DECISION' ? 'para apelar' : 'de descargos'}:</b> hasta el {formatFechaLarga(p.fechaLimite)} (5 días hábiles).
        </CardContent></Card>
      )}

      {/* Acta / acuerdo final */}
      {acta && (
        <Card className="mb-4"><CardContent className="py-3 flex items-center gap-3">
          <FileText className="size-5 text-muted-foreground shrink-0" />
          <span className="text-sm flex-1 truncate">Acta / acuerdo final: {acta.nombre}</span>
          <Button size="sm" variant="outline" asChild><a href={`/api/documentos/${acta.id}`} target="_blank" rel="noreferrer">Abrir</a></Button>
        </CardContent></Card>
      )}

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
                <SoportesLista documentos={porEtapa.get(e.id) ?? []} />
              </li>
            ))}
          </ol>
        </CardContent></Card>
      )}

      {puedeEditar && !p.cerrado && (
        <AccionesDisciplinario
          procesoId={p.id}
          etapa={p.etapa}
          // El plazo se compara aquí, en el servidor: el reloj del navegador lo
          // pone el usuario y no puede decidir cuándo se agota un término legal.
          plazoVencido={Boolean(p.fechaLimite && p.fechaLimite < hoyBogota())}
          fechaLimite={p.fechaLimite ? formatFechaLarga(p.fechaLimite) : null}
        />
      )}
    </div>
  )
}
