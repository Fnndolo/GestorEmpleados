'use client'

import { Eye } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { VisorPdf } from '@/components/documentos/visor-pdf'

/**
 * Casilla «Generar autorización de datos» de los formularios de alta con PDF
 * (OPS y laboral). La autorización (Ley 1581) va aparte del PDF del contrato y
 * no siempre hace falta: a veces ya se recogió aparte. Como la arma la app, se
 * puede mirar antes de enviarla con el nombre y la cédula de verdad, no los de
 * una muestra. Solo cambia quién la firma.
 */
export function GenerarAutorizacion({ generar, onGenerar, vistaPreviaUrl, firmante }: {
  generar: boolean
  onGenerar: (v: boolean) => void
  /** URL de la vista previa; nula mientras no haya a quién generársela. */
  vistaPreviaUrl: string | null
  /** «el contratista» / «el empleado». */
  firmante: string
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3 text-sm sm:flex-row sm:items-start">
      <label className="flex min-w-0 flex-1 items-start gap-2">
        <Checkbox checked={generar} onCheckedChange={(v) => onGenerar(v === true)} className="mt-0.5" />
        <span>
          <span className="font-medium">Generar autorización de datos</span>
          <span className="block text-xs text-muted-foreground">
            La arma la app con los datos de la ficha (Ley 1581) y la firma {firmante} junto con el contrato. Desmárcala si ya se recogió aparte.
          </span>
        </span>
      </label>
      {generar && (
        vistaPreviaUrl ? (
          <VisorPdf url={vistaPreviaUrl} titulo="Autorización de datos · vista previa" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            <Eye className="size-4" /> Ver cómo queda
          </VisorPdf>
        ) : (
          <span className="shrink-0 text-xs text-muted-foreground sm:pt-1">Elige a la persona para verla.</span>
        )
      )}
    </div>
  )
}
