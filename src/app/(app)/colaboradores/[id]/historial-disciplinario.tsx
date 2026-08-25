'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Gavel, MessageSquareWarning, Trash2, ExternalLink, ArrowUpRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { eliminarLlamadoAtencion, escalarLlamadoAProceso } from '@/app/(app)/juridica/acciones'

export type ItemHistorial =
  | {
      clase: 'llamado'; id: string; fecha: string; tipo: 'VERBAL' | 'ESCRITO'; motivo: string
      detalle: string | null
      /** Proceso al que ya se escaló, si la conducta se repitió. */
      procesoId: string | null
    }
  | { clase: 'proceso'; id: string; fecha: string; asunto: string; etapa: string; cerrado: boolean; decision: string | null }

const ETAPA: Record<string, string> = {
  CITACION_DESCARGOS: 'Citación a descargos',
  DESCARGOS: 'Descargos',
  DECISION: 'Decisión',
  RECURSO: 'Recurso',
  CERRADO: 'Cerrado',
}

/**
 * Historial disciplinario del colaborador: llamados de atención y procesos
 * juntos, del más reciente al más antiguo.
 *
 * Van en la misma lista a propósito. Lo que importa al valorar una falta no es
 * de qué tipo fue cada anotación sino si hubo antecedentes: tres llamados por lo
 * mismo antes de un proceso es la secuencia que sustenta la justa causa, y esa
 * secuencia se pierde si cada cosa se consulta en una pantalla distinta.
 */
export function HistorialDisciplinario({
  items, puedeEliminar, puedeEscalar,
}: {
  items: ItemHistorial[]
  puedeEliminar: boolean
  /** Abrir procesos exige permiso de crear en Jurídica. */
  puedeEscalar: boolean
}) {
  const router = useRouter()
  const [borrando, setBorrando] = useState<string | null>(null)
  const [escalando, setEscalando] = useState<Extract<ItemHistorial, { clase: 'llamado' }> | null>(null)

  async function borrar(id: string) {
    if (!confirm('¿Eliminar este llamado de atención? Se pierde como antecedente.')) return
    setBorrando(id)
    const res = await eliminarLlamadoAtencion({ id })
    setBorrando(null)
    if (!res.ok) { toast.error(res.error); return }
    toast.success('Llamado eliminado.')
    router.refresh()
  }

  if (items.length === 0) {
    return (
      <Card><CardContent className="py-8">
        <p className="text-center text-sm text-muted-foreground">
          Sin llamados de atención ni procesos disciplinarios.
        </p>
      </CardContent></Card>
    )
  }

  const llamados = items.filter((i) => i.clase === 'llamado').length
  const procesos = items.length - llamados

  return (
    <Card><CardContent className="py-4">
      <p className="mb-3 text-xs text-muted-foreground">
        {llamados} llamado{llamados === 1 ? '' : 's'} de atención · {procesos} proceso{procesos === 1 ? '' : 's'} disciplinario{procesos === 1 ? '' : 's'}
      </p>
      <ul className="divide-y">
        {items.map((i) => (
          <li key={`${i.clase}-${i.id}`} className="flex flex-wrap items-start gap-2 py-3 text-sm">
            {i.clase === 'llamado' ? (
              <MessageSquareWarning className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            ) : (
              <Gavel className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-medium">{i.clase === 'llamado' ? i.motivo : i.asunto}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {i.fecha}
                {i.clase === 'llamado'
                  ? ` · Llamado de atención ${i.tipo === 'VERBAL' ? 'verbal' : 'escrito'}`
                  : ` · Proceso disciplinario`}
              </p>
              {i.clase === 'llamado' && i.detalle && (
                <p className="mt-1 text-xs text-muted-foreground">{i.detalle}</p>
              )}
              {i.clase === 'proceso' && i.decision && (
                <p className="mt-1 text-xs text-muted-foreground">Decisión: {i.decision}</p>
              )}
            </div>
            {i.clase === 'proceso' ? (
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant={i.cerrado ? 'secondary' : 'default'}>
                  {i.cerrado ? 'Cerrado' : ETAPA[i.etapa] ?? i.etapa}
                </Badge>
                <Button size="sm" variant="ghost" asChild>
                  <Link href={`/juridica/disciplinarios/${i.id}`}><ExternalLink className="size-4" /> Ver</Link>
                </Button>
              </div>
            ) : (
              <div className="flex shrink-0 items-center gap-2">
                {i.procesoId ? (
                  <>
                    <Badge variant="secondary">Escalado</Badge>
                    <Button size="sm" variant="ghost" asChild>
                      <Link href={`/juridica/disciplinarios/${i.procesoId}`}>
                        <ExternalLink className="size-4" /> Ver proceso
                      </Link>
                    </Button>
                  </>
                ) : (
                  <>
                    <Badge variant="outline">Antecedente</Badge>
                    {puedeEscalar && (
                      <Button size="sm" variant="outline" onClick={() => setEscalando(i)}>
                        <ArrowUpRight className="size-4" /> Escalar
                      </Button>
                    )}
                    {/* Un llamado ya escalado no se borra: es la prueba de que el
                        proceso tenía antecedentes. */}
                    {puedeEliminar && (
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={borrando === i.id}
                        onClick={() => borrar(i.id)}
                        aria-label="Eliminar llamado"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {escalando && (
        <DialogEscalar
          llamado={escalando}
          otros={items.filter(
            (x): x is Extract<ItemHistorial, { clase: 'llamado' }> =>
              x.clase === 'llamado' && x.id !== escalando.id && !x.procesoId,
          )}
          onClose={() => setEscalando(null)}
        />
      )}
    </CardContent></Card>
  )
}
