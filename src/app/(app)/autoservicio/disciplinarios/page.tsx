import { requerirSesion } from '@/server/sesion'
import { tramiteAplica, NoAplica } from '../no-aplica'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Gavel, CircleCheck, MessageSquareWarning } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatFechaLarga } from '@/lib/fechas'
import { Descargos, Apelacion } from './descargos'
import { SoportesLista, type SoporteDoc } from '@/app/(app)/juridica/_ui'

export const metadata = { title: 'Mis procesos disciplinarios · Smart Gadgets RH' }

const ETAPA: Record<string, string> = { CITACION_DESCARGOS: 'Citación a descargos', DESCARGOS: 'Descargos presentados', DECISION: 'Decisión', RECURSO: 'Recurso', CERRADO: 'Cerrado' }

/** Color del borde izquierdo por etapa — paleta del sistema. */
const BORDE_ETAPA: Record<string, string> = {
  CITACION_DESCARGOS: 'border-l-amber-500',
  DESCARGOS: 'border-l-sky-500',
  DECISION: 'border-l-violet-500',
  RECURSO: 'border-l-rose-500',
  CERRADO: 'border-l-emerald-500',
}

export default async function MisDisciplinariosPage() {
  const usuario = await requerirSesion()

  if (!usuario.colaboradorId) {
    return (
      <div className="max-w-5xl">
        <Encabezado titulo="Mis procesos disciplinarios" />
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Tu usuario no está vinculado a una ficha de colaborador.</CardContent></Card>
      </div>
    )
  }

  if (!(await tramiteAplica(usuario.colaboradorId, 'disciplinarios'))) {
    return <NoAplica titulo="Mis disciplinarios" motivo="El proceso disciplinario aplica a la relación laboral. En un contrato de prestación de servicios, los incumplimientos se manejan por las cláusulas del contrato." />
  }

  const llamados = await prisma.llamadoAtencion.findMany({
    where: { colaboradorId: usuario.colaboradorId },
    orderBy: { fecha: 'desc' },
  })

  const procesos = await prisma.procesoDisciplinario.findMany({
    where: { colaboradorId: usuario.colaboradorId },
    include: { etapas: { orderBy: { fecha: 'asc' } } },
    orderBy: { creadoEn: 'desc' },
  })

  // Soportes anclados a cada etapa (para que el empleado los pueda ver)
  const etapaIds = procesos.flatMap((p) => p.etapas.map((e) => e.id))
  const docsEtapa = etapaIds.length
    ? await prisma.documento.findMany({
        where: { entidadTipo: 'EtapaProceso', entidadId: { in: etapaIds } },
        orderBy: { creadoEn: 'asc' },
        select: { id: true, nombre: true, mimeType: true, entidadId: true },
      })
    : []
  const porEtapa = new Map<string, SoporteDoc[]>()
  for (const d of docsEtapa) {
    const arr = porEtapa.get(d.entidadId) ?? []
    arr.push({ id: d.id, nombre: d.nombre, mimeType: d.mimeType })
    porEtapa.set(d.entidadId, arr)
  }

  return (
    <div className="max-w-5xl">
      <Encabezado titulo="Mis procesos disciplinarios" descripcion="Aquí puedes ver los llamados de atención y los procesos en tu contra, y presentar tus descargos (derecho de defensa)." />

      {/* Los llamados de atención van aparte: no son sanciones y no hay nada que
          responder, pero el colaborador tiene derecho a saber qué le registraron. */}
      {llamados.length > 0 && (
        <Card className="mb-4"><CardContent className="py-4">
          <h3 className="mb-1 text-sm font-medium">Llamados de atención ({llamados.length})</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            No son sanciones y no tienes que presentar descargos. Quedan registrados en tu historial.
          </p>
          <ul className="divide-y">
            {llamados.map((l) => (
              <li key={l.id} className="flex items-start gap-2 py-2.5 text-sm">
                <MessageSquareWarning className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{l.motivo}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatFechaLarga(l.fecha)} · Llamado {l.tipo === 'VERBAL' ? 'verbal' : 'escrito'}
                  </p>
                  {l.detalle && <p className="mt-1 text-xs text-muted-foreground">{l.detalle}</p>}
                </div>
              </li>
            ))}
          </ul>
        </CardContent></Card>
      )}
      {procesos.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground"><Gavel className="size-8" /><p>No tienes procesos disciplinarios.</p></CardContent></Card>
      ) : (
        <div className="space-y-4">
          {procesos.map((p) => {
            const yaPresentoDescargos = p.etapas.some((e) => e.etapa === 'DESCARGOS')
            const puedePresentar = !p.cerrado && !yaPresentoDescargos && p.etapa === 'CITACION_DESCARGOS'
            const puedeApelar = !p.cerrado && p.etapa === 'DECISION'
            return (
              <Card key={p.id}>
                <CardContent className="py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <p className="font-medium">{p.asunto}</p>
                    <div className="flex items-center gap-2">
                      {/* Que el colaborador vea de entrada si es una corrección o
                          algo que puede terminar en sanción. */}
                      <Badge variant="outline">
                        {p.clase === 'LLAMADO_ATENCION' ? 'Llamado de atención' : 'Proceso disciplinario'}
                      </Badge>
                      <Badge variant={p.cerrado ? 'secondary' : 'default'}>{ETAPA[p.etapa]}</Badge>
                    </div>
                  </div>
                  {p.descripcion && <p className="text-sm text-muted-foreground mb-3">{p.descripcion}</p>}
                  {p.etapas.length > 0 && (
                    <ol className="mb-3">
                      {/* Bloques cuadrados contiguos; solo el borde izquierdo lleva el color de la etapa. */}
                      {p.etapas.map((e) => (
                        <li
                          key={e.id}
                          className={cn(
                            'border border-l-4 bg-card px-3.5 py-2.5 text-sm [&+li]:-mt-px',
                            BORDE_ETAPA[e.etapa] ?? 'border-l-primary',
                          )}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <CircleCheck className="size-4 shrink-0 text-muted-foreground" />
                            <span className="font-semibold">{ETAPA[e.etapa]}</span>
                            <span className="text-xs text-muted-foreground">· {formatFechaLarga(e.fecha)}</span>
                          </div>
                          {e.detalle && <p className="mt-0.5 text-xs text-muted-foreground">{e.detalle}</p>}
                          <SoportesLista documentos={porEtapa.get(e.id) ?? []} />
                        </li>
                      ))}
                    </ol>
                  )}
                  {!p.cerrado && p.fechaLimite && (
                    <p className="mb-2 text-xs text-amber-600">
                      Tienes hasta el {formatFechaLarga(p.fechaLimite)} (5 días hábiles) para {p.etapa === 'DECISION' ? 'apelar' : 'presentar tus descargos'}.
                    </p>
                  )}
                  {puedePresentar ? (
                    <Descargos procesoId={p.id} />
                  ) : puedeApelar ? (
                    <Apelacion procesoId={p.id} />
                  ) : p.cerrado ? (
                    <p className="text-xs text-muted-foreground">Proceso cerrado.</p>
                  ) : (
                    <p className="text-xs text-emerald-600">
                      {p.clase === 'LLAMADO_ATENCION'
                        ? 'Ya diste tu explicación. Un llamado de atención no lleva sanción: queda en tu historial y el área encargada lo cerrará.'
                        : 'Ya presentaste tus descargos. El área encargada continuará con el proceso.'}
                    </p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
