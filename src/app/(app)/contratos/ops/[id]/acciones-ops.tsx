'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CircleX, Ellipsis, Paperclip, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { DialogSubir } from '@/components/documentos/gestor-documentos'
import { CerrarContratoOps } from './cerrar-contrato'
import { EliminarContratoOps } from './eliminar-contrato'

/**
 * Las acciones del contrato OPS, arriba en el encabezado (igual que en el
 * contrato laboral): cerrar el contrato, adjuntar un documento y, aparte y en
 * rojo, eliminar —solo para el error de registro y mientras el contratista no
 * lo haya firmado—.
 */
export function AccionesOps({ contratoId, numero, sedeId, vigente, vencido, fechaFin, hoy, puedeEliminar, firmado }: {
  contratoId: string
  numero: string
  sedeId: string | null
  vigente: boolean
  vencido: boolean
  fechaFin: string
  hoy: string
  puedeEliminar: boolean
  /** Ya lo firmó el contratista: no se puede eliminar. */
  firmado: boolean
}) {
  const router = useRouter()
  const [dialogo, setDialogo] = useState<'cerrar' | 'adjuntar' | 'eliminar' | null>(null)
  const [subiendo, setSubiendo] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" aria-label="Acciones del contrato">
            <Ellipsis className="size-4" />
            {/* En el celular solo los tres puntos: con el texto, el título se cortaba. */}
            <span className="hidden sm:inline">Acciones</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {vigente && <DropdownMenuItem onSelect={() => setDialogo('cerrar')}><CircleX className="size-4" /> Cerrar contrato</DropdownMenuItem>}
          <DropdownMenuItem onSelect={() => setDialogo('adjuntar')}><Paperclip className="size-4" /> Adjuntar documento</DropdownMenuItem>
          {puedeEliminar && !firmado && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDialogo('eliminar')}><Trash2 className="size-4" /> Eliminar contrato</DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {vigente && (
        <CerrarContratoOps
          contratoId={contratoId} numero={numero} fechaFin={fechaFin} vencido={vencido} hoy={hoy}
          abierto={dialogo === 'cerrar'} onAbiertoChange={(v) => setDialogo(v ? 'cerrar' : null)}
        />
      )}
      {puedeEliminar && !firmado && (
        <EliminarContratoOps
          contratoId={contratoId} numero={numero} firmado={firmado}
          abierto={dialogo === 'eliminar'} onAbiertoChange={(v) => setDialogo(v ? 'eliminar' : null)}
        />
      )}
      {/* Anexos: entidad propia para no mezclarse con el PDF del contrato, que no se borra desde aquí. */}
      {dialogo === 'adjuntar' && (
        <DialogSubir
          entidadTipo="ContratoOpsAnexo" entidadId={contratoId} sedeId={sedeId}
          subiendo={subiendo} setSubiendo={setSubiendo}
          onClose={() => setDialogo(null)} onSubido={() => { setDialogo(null); router.refresh() }}
        />
      )}
    </>
  )
}
