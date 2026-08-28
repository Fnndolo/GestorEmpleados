'use client'

import { useState } from 'react'
import { FileText, Upload } from 'lucide-react'
import { ContratoOpsSplit } from './form-ops'
import { ContratoOpsSubido } from './form-ops-subido'
import type { FuncionesCargo } from '@/lib/contrato-variables'

/**
 * Los dos caminos para crear un contrato OPS nuevo.
 *
 * Desde plantilla es el camino normal: el contrato se arma en la app y queda
 * consistente con el texto aprobado. Subiendo el PDF sirve cuando el documento
 * se redactó por fuera; el contrato entra igual al flujo de firma, solo que las
 * firmas se estampan sobre el archivo aportado en vez de regenerarlo.
 *
 * Ojo con no confundirlo con «Subir contrato existente» de la ficha del
 * colaborador: aquel es para contratos YA firmados en físico y por eso omite la
 * firma digital. Este pide firma.
 */

type Props = {
  sedes: { id: string; nombre: string; ciudad: string }[]
  cargos: { id: string; nombre: string; funciones: FuncionesCargo | null }[]
  empresa: React.ComponentProps<typeof ContratoOpsSplit>['empresa']
  plantilla: React.ComponentProps<typeof ContratoOpsSplit>['plantilla']
}

type Modo = 'plantilla' | 'subir'

const OPCIONES: { valor: Modo; titulo: string; detalle: string; icono: typeof FileText }[] = [
  { valor: 'plantilla', titulo: 'Desde plantilla', detalle: 'Se redacta en la app y ves el contrato mientras lo llenas.', icono: FileText },
  { valor: 'subir', titulo: 'Subir el PDF', detalle: 'El contrato ya está redactado por fuera; se firma igual en la app.', icono: Upload },
]

export function ModoNuevoOps({ sedes, cargos, empresa, plantilla }: Props) {
  const [modo, setModo] = useState<Modo>('plantilla')

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {OPCIONES.map((o) => {
          const activo = modo === o.valor
          return (
            <button
              key={o.valor}
              type="button"
              onClick={() => setModo(o.valor)}
              aria-pressed={activo}
              className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                activo ? 'border-primary bg-primary/5' : 'hover:bg-accent/40'
              }`}
            >
              <o.icono className={`mt-0.5 size-4 shrink-0 ${activo ? 'text-primary' : 'text-muted-foreground'}`} />
              <div className="min-w-0">
                <p className="text-sm font-medium">{o.titulo}</p>
                <p className="text-xs text-muted-foreground">{o.detalle}</p>
              </div>
            </button>
          )
        })}
      </div>

      {modo === 'plantilla' ? (
        <ContratoOpsSplit sedes={sedes} cargos={cargos} empresa={empresa} plantilla={plantilla} />
      ) : (
        <ContratoOpsSubido sedes={sedes} cargos={cargos} />
      )}
    </div>
  )
}
