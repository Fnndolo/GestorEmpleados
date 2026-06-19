'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import imageCompression from 'browser-image-compression'
import { toast } from 'sonner'
import { Camera, X } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Spinner } from '@/components/ui/spinner'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

export function FotoUploader({
  colaboradorId, iniciales, tieneFoto, puedeEditar,
}: {
  colaboradorId: string; iniciales: string; tieneFoto: boolean; puedeEditar: boolean
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [version, setVersion] = useState(0)

  async function onSeleccion(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setSubiendo(true)
    try {
      const comprimida = await imageCompression(f, { maxWidthOrHeight: 800, maxSizeMB: 0.5, useWebWorker: true })
      const fd = new FormData()
      fd.append('archivo', comprimida, 'foto.jpg')
      const resp = await fetch(`/api/colaboradores/${colaboradorId}/foto`, { method: 'POST', body: fd })
      if (!resp.ok) throw new Error('No se pudo subir')
      toast.success('Foto actualizada.')
      setVersion((v) => v + 1)
      router.refresh()
    } catch {
      toast.error('No se pudo actualizar la foto.')
    } finally {
      setSubiendo(false)
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
        {tieneFoto && <AvatarImage src={`/api/documentos/foto/${colaboradorId}?v=${version}`} alt="" />}
        <AvatarFallback className="text-lg">{iniciales}</AvatarFallback>
      </Avatar>
      {puedeEditar && (
        <>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={subiendo}
            className="absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow ring-2 ring-background"
            aria-label="Cambiar foto"
          >
            {subiendo ? <Spinner className="size-3.5" /> : <Camera className="size-3.5" />}
          </button>
          {tieneFoto && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  disabled={subiendo}
                  className="absolute -top-1 -right-1 flex size-6 items-center justify-center rounded-full bg-destructive text-white shadow ring-2 ring-background"
                  aria-label="Eliminar foto"
                >
                  <X className="size-3.5" />
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Eliminar foto de perfil</AlertDialogTitle>
                  <AlertDialogDescription>Se eliminará la foto del colaborador. Esta acción no se puede deshacer.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={eliminar} className="bg-destructive text-white hover:bg-destructive/90">Eliminar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <input ref={inputRef} type="file" accept="image/*" capture="user" className="hidden" onChange={onSeleccion} />
        </>
      )}
    </div>
  )
}
