'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Pill } from '@/components/ui-kit'
import type { SoporteDoc } from '@/app/(app)/juridica/_ui'
import { RutaProceso } from '@/components/juridica/ruta-proceso'
import type { FaseRuta } from '@/lib/ruta-disciplinaria'

/**
 * Un proceso disciplinario en la vista del colaborador: plegado muestra el
 * asunto, en qué va y lo que exige acción (el plazo y el formulario de
 * descargos o apelación); al tocarlo se despliega la historia completa
 * —descripción, etapas con sus soportes— que es larga y casi nunca hace
 * falta de entrada.
 */
export type EtapaItem = { id: string; etapa: string; etiqueta: string; fecha: string; detalle: string | null; soportes: SoporteDoc[] }

export function ProcesoPlegable({
  asunto, clase, etapaEtiqueta, cerrado, ruta, descripcion, etapas, plazo, children,
}: {
  asunto: string
  clase: string
  etapaEtiqueta: string
  cerrado: boolean
  /** Fases cumplidas / en curso / pendientes: siempre a la vista, aunque esté plegado. */
  ruta: FaseRuta[]
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
              {/* La etapa actual en tinta; la clase, en gris claro. */}
              <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold', cerrado ? 'bg-foreground/8 text-muted-foreground' : 'bg-foreground text-background')}>{etapaEtiqueta}</span>
              <span className="text-[11px] text-muted-foreground">· {etapas.length} actuaci{etapas.length === 1 ? 'ón' : 'ones'}</span>
            </span>
          </span>
          <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', abierto && 'rotate-180')} />
        </button>

        {/* El rastreo de fases va fuera del botón y siempre visible: es lo primero que se quiere saber. */}
        <div className="mt-3 rounded-lg border bg-muted/20 px-3 py-3">
          <RutaProceso fases={ruta} compacta />
        </div>

        {plazo && <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-400">{plazo}</p>}
        {children && <div className="mt-2">{children}</div>}

        {abierto && (
          <div className="mt-3 space-y-3 border-t pt-3">
            {descripcion && <p className="text-sm text-muted-foreground">{descripcion}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
