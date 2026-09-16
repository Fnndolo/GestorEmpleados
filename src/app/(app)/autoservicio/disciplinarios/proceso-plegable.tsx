'use client'

import { useState } from 'react'
import { ChevronDown, CircleCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Pill, type PillTone } from '@/components/ui-kit'
import { SoportesLista, type SoporteDoc } from '@/app/(app)/juridica/_ui'

/**
 * Un proceso disciplinario en la vista del colaborador: plegado muestra el
 * asunto, en qué va y lo que exige acción (el plazo y el formulario de
 * descargos o apelación); al tocarlo se despliega la historia completa
 * —descripción, etapas con sus soportes— que es larga y casi nunca hace
 * falta de entrada.
 */
export type EtapaItem = { id: string; etapa: string; etiqueta: string; fecha: string; detalle: string | null; soportes: SoporteDoc[] }

const TONO_ETAPA: Record<string, PillTone> = {
  CITACION_DESCARGOS: 'warn', DESCARGOS: 'info', DECISION: 'accent', RECURSO: 'bad', CERRADO: 'muted',
}
/** Color del borde izquierdo por etapa — paleta del sistema. */
const BORDE_ETAPA: Record<string, string> = {
  CITACION_DESCARGOS: 'border-l-amber-500',
  DESCARGOS: 'border-l-sky-500',
  DECISION: 'border-l-violet-500',
  RECURSO: 'border-l-rose-500',
  CERRADO: 'border-l-emerald-500',
}

export function ProcesoPlegable({
  asunto, clase, etapa, etapaEtiqueta, cerrado, descripcion, etapas, plazo, children,
}: {
  asunto: string
  clase: string
  etapa: string
  etapaEtiqueta: string
  cerrado: boolean
  descripcion: string | null
  etapas: EtapaItem[]
  /** "Tienes hasta el … para presentar tus descargos", solo mientras corre el plazo. */
  plazo: string | null
  /** Lo que exige acción (descargos, apelación) o el estado final: siempre a la vista. */
  children?: React.ReactNode
}) {
  const [abierto, setAbierto] = useState(false)
  return (
    <Card>
      <CardContent className="py-3">
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="flex w-full items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold">{asunto}</span>
            <span className="mt-1 flex flex-wrap items-center gap-1.5">
              <Pill tone="muted">{clase === 'LLAMADO_ATENCION' ? 'Llamado de atención' : 'Proceso disciplinario'}</Pill>
              <Pill tone={cerrado ? 'muted' : TONO_ETAPA[etapa] ?? 'info'}>{etapaEtiqueta}</Pill>
              <span className="text-[11px] text-muted-foreground">· {etapas.length} actuaci{etapas.length === 1 ? 'ón' : 'ones'}</span>
            </span>
          </span>
          <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', abierto && 'rotate-180')} />
        </button>

        {plazo && <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-400">{plazo}</p>}
        {children && <div className="mt-2">{children}</div>}

        {abierto && (
          <div className="mt-3 space-y-3 border-t pt-3">
            {descripcion && <p className="text-sm text-muted-foreground">{descripcion}</p>}
            {etapas.length > 0 && (
              <ol>
                {/* Bloques cuadrados contiguos; solo el borde izquierdo lleva el color de la etapa. */}
                {etapas.map((e) => (
                  <li key={e.id} className={cn('border border-l-4 bg-card px-3.5 py-2.5 text-sm [&+li]:-mt-px', BORDE_ETAPA[e.etapa] ?? 'border-l-primary')}>
                    <div className="flex flex-wrap items-center gap-2">
                      <CircleCheck className="size-4 shrink-0 text-muted-foreground" />
                      <span className="font-semibold">{e.etiqueta}</span>
                      <span className="text-xs text-muted-foreground">· {e.fecha}</span>
                    </div>
                    {e.detalle && <p className="mt-0.5 text-xs text-muted-foreground">{e.detalle}</p>}
                    <SoportesLista documentos={e.soportes} />
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
