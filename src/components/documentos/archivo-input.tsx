'use client'

import { toast } from 'sonner'
import { Paperclip } from 'lucide-react'

/** Selector de un PDF o una imagen, leído como data URI (máx. 8 MB). */
export function ArchivoInput({ id, archivo, onArchivo }: {
  id: string
  archivo: { nombre: string; dataUri: string } | null
  onArchivo: (a: { nombre: string; dataUri: string }) => void
}) {
  function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 8 * 1024 * 1024) { toast.error('El archivo pesa más de 8 MB.'); return }
    const lector = new FileReader()
    lector.onload = () => onArchivo({ nombre: f.name, dataUri: String(lector.result) })
    lector.readAsDataURL(f)
  }
  return (
    <>
      <label htmlFor={id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground hover:bg-accent/50">
        <Paperclip className="size-4 shrink-0" />
        <span className="min-w-0 truncate">{archivo ? archivo.nombre : 'Elegir archivo (PDF o imagen)'}</span>
      </label>
      <input id={id} type="file" accept="application/pdf,image/*" className="sr-only" onChange={elegir} />
    </>
  )
}
