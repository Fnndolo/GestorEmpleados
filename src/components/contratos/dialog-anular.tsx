'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Ban, Trash2, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

type Resultado = { ok: boolean; error?: string }

/**
 * Anular o eliminar un registro con el motivo obligatorio (queda en auditoría):
 * el mismo diálogo que usan las novedades. `accion` recibe el motivo y devuelve
 * el resultado de la Server Action; al confirmar se refresca la pantalla.
 */
export function DialogAnular({ titulo, detalle, nota, verbo = 'Anular', mensajeOk = 'Anulado.', accion, onClose }: {
  titulo: string
  detalle: string
  /** Aclaración debajo del resumen (p. ej. "· la solicitud del colaborador queda anulada"). */
  nota?: string
  verbo?: 'Anular' | 'Eliminar' | 'Revertir' | 'Reemplazar'
  mensajeOk?: string
  accion: (motivo: string) => Promise<Resultado>
  onClose: () => void
}) {
  const router = useRouter()
  const [motivo, setMotivo] = useState('')
  const [g, setG] = useState(false)

  async function confirmar() {
    setG(true)
    const res = await accion(motivo)
    setG(false)
    if (res.ok) { toast.success(mensajeOk); onClose(); router.refresh() } else toast.error(res.error ?? 'No se pudo completar.', { duration: 8000 })
  }

  const Icono = verbo === 'Eliminar' ? Trash2 : Ban
  const PREGUNTA: Record<NonNullable<typeof verbo>, string> = { Anular: '¿Por qué se anula?', Eliminar: '¿Por qué se elimina?', Revertir: '¿Por qué se revierte?', Reemplazar: '¿Por qué se reemplaza?' }
  return (
    <Dialog open onOpenChange={(o) => !o && !g && onClose()}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader><DialogTitle>{titulo}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{detalle}{nota ? ` ${nota}` : ''}</p>
        <div className="space-y-1.5">
          <Label htmlFor="motivo-anulacion">Motivo <span className="text-destructive">*</span></Label>
          <Textarea id="motivo-anulacion" rows={2} placeholder={PREGUNTA[verbo]} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={g}>Volver</Button>
          <Button variant="destructive" onClick={confirmar} disabled={g || motivo.trim().length < 5}>{g ? <Spinner /> : <Icono className="size-4" />} {verbo}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Botón de anular/eliminar (rojo, fantasma) que NO se esconde cuando está
 * bloqueado: queda inerte y el tooltip dice por qué. Con `soloIcono` cabe en una
 * fila estrecha (celular).
 */
export function BotonAnular({ onClick, motivoBloqueo, etiqueta = 'Anular', icono = 'anular', soloIcono = false }: {
  onClick: () => void
  motivoBloqueo?: string | null
  etiqueta?: string
  icono?: 'anular' | 'eliminar'
  soloIcono?: boolean
}) {
  const Icono = icono === 'eliminar' ? Trash2 : Ban
  return (
    <BotonConBloqueo onClick={onClick} motivoBloqueo={motivoBloqueo} etiqueta={etiqueta} soloIcono={soloIcono} clase="text-destructive hover:text-destructive">
      <Icono className="size-4" />
    </BotonConBloqueo>
  )
}

/** El lápiz de editar, con el mismo trato de bloqueo explicado. */
export function BotonEditar({ onClick, motivoBloqueo, etiqueta = 'Editar', soloIcono = true }: {
  onClick: () => void
  motivoBloqueo?: string | null
  etiqueta?: string
  soloIcono?: boolean
}) {
  return (
    <BotonConBloqueo onClick={onClick} motivoBloqueo={motivoBloqueo} etiqueta={etiqueta} soloIcono={soloIcono}>
      <Pencil className="size-4" />
    </BotonConBloqueo>
  )
}

function BotonConBloqueo({ onClick, motivoBloqueo, etiqueta, soloIcono, clase, children }: {
  onClick: () => void
  motivoBloqueo?: string | null
  etiqueta: string
  soloIcono: boolean
  clase?: string
  children: React.ReactNode
}) {
  const [abierto, setAbierto] = useState(false)
  if (!motivoBloqueo) {
    return (
      <Button type="button" size={soloIcono ? 'icon' : 'sm'} variant="ghost" className={`${soloIcono ? 'size-8' : ''} ${clase ?? ''}`} onClick={onClick} aria-label={etiqueta} title={etiqueta}>
        {children}{!soloIcono && <span>{etiqueta}</span>}
      </Button>
    )
  }
  return (
    <TooltipProvider>
      <Tooltip open={abierto} onOpenChange={setAbierto}>
        <TooltipTrigger asChild>
          {/* Un <button disabled> no dispara hover ni clic: el <span> recibe el evento y abre el tooltip. */}
          <span
            tabIndex={0}
            role="button"
            aria-disabled
            aria-label={`${etiqueta} (bloqueado)`}
            onClick={(e) => { e.preventDefault(); setAbierto(true) }}
            className={`inline-flex ${soloIcono ? 'size-8' : 'h-8 gap-1.5 px-2.5 text-sm'} shrink-0 cursor-not-allowed items-center justify-center rounded-md text-muted-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
          >
            {children}{!soloIcono && <span>{etiqueta}</span>}
          </span>
        </TooltipTrigger>
        <TooltipContent sideOffset={6} className="max-w-64 leading-relaxed">{motivoBloqueo}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
