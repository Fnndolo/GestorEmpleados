'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import imageCompression from 'browser-image-compression'
import { toast } from 'sonner'
import { Camera, ImageUp, Trash2 } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { colorAvatar } from '@/lib/etiquetas'
import { Spinner } from '@/components/ui/spinner'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

const CLASE_CAMARA =
  'absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow ring-2 ring-background'

export function FotoUploader({
  colaboradorId, iniciales, nombreCompleto, fotoUrl, puedeEditar,
}: {
  colaboradorId: string; iniciales: string; nombreCompleto?: string
  /** URL versionada de la foto (ver `urlFoto`), o null si no tiene. */
  fotoUrl: string | null
  puedeEditar: boolean
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [version, setVersion] = useState(0)
  const [confirmarQuitar, setConfirmarQuitar] = useState(false)

  async function onSeleccion(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setSubiendo(true)
    try {
      // Dos tamaños: la completa para la ficha y una miniatura para los círculos
      // de las listas, que a 96 px pesa una fracción y carga al instante.
      const [comprimida, miniatura] = await Promise.all([
        imageCompression(f, { maxWidthOrHeight: 800, maxSizeMB: 0.5, useWebWorker: true }),
        imageCompression(f, { maxWidthOrHeight: 96, maxSizeMB: 0.03, useWebWorker: true }),
      ])
      const fd = new FormData()
      fd.append('archivo', comprimida, 'foto.jpg')
      fd.append('miniatura', miniatura, 'mini.jpg')
      const resp = await fetch(`/api/colaboradores/${colaboradorId}/foto`, { method: 'POST', body: fd })
      if (!resp.ok) throw new Error('No se pudo subir')
      toast.success('Foto actualizada.')
      setVersion((v) => v + 1)
      router.refresh()
    } catch {
      toast.error('No se pudo actualizar la foto.')
    } finally {
      setSubiendo(false)
      // Si no se vacía, elegir el MISMO archivo otra vez (p. ej. al reintentar
      // tras un fallo) no dispara `onChange` y parece que el botón no hace nada.
      e.target.value = ''
    }
  }

  async function eliminar() {
    setSubiendo(true)
    try {
      const resp = await fetch(`/api/colaboradores/${colaboradorId}/foto`, { method: 'DELETE' })
      if (!resp.ok) throw new Error('No se pudo eliminar')
      toast.success('Foto eliminada.')
      setVersion((v) => v + 1)
      router.refresh()
    } catch {
      toast.error('No se pudo eliminar la foto.')
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <div className="relative">
      <Avatar className="size-20">
        {fotoUrl && <AvatarImage src={`${fotoUrl}&r=${version}`} alt="" />}
        <AvatarFallback
          className="text-lg font-semibold text-white"
          style={{ backgroundColor: colorAvatar(nombreCompleto ?? iniciales) }}
        >
          {iniciales}
        </AvatarFallback>
      </Avatar>
      {puedeEditar && (
        <>
          {/* Un solo control, la cámara. Sin foto abre el selector directo; con
              foto despliega Cambiar / Quitar: la X roja encima de la cara se
              veía como un error y quedaba a un toque de borrar sin querer. */}
          {fotoUrl ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button disabled={subiendo} className={CLASE_CAMARA} aria-label="Opciones de la foto">
                  {subiendo ? <Spinner className="size-3.5" /> : <Camera className="size-3.5" />}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="bottom">
                <DropdownMenuItem onSelect={() => inputRef.current?.click()}><ImageUp className="size-4" /> Cambiar foto</DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirmarQuitar(true)}><Trash2 className="size-4" /> Quitar foto</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <button onClick={() => inputRef.current?.click()} disabled={subiendo} className={CLASE_CAMARA} aria-label="Cambiar foto">
              {subiendo ? <Spinner className="size-3.5" /> : <Camera className="size-3.5" />}
            </button>
          )}
          <AlertDialog open={confirmarQuitar} onOpenChange={setConfirmarQuitar}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Quitar la foto de perfil</AlertDialogTitle>
                <AlertDialogDescription>Volverán a verse las iniciales. Esta acción no se puede deshacer.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={eliminar} className="bg-destructive text-white hover:bg-destructive/90">Quitar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {/* Sin `capture`: en el celular forzaba la cámara frontal y no dejaba elegir una foto de la galería. */}
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onSeleccion} />
        </>
      )}
    </div>
  )
}
