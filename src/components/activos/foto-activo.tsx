'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Camera, X, type LucideIcon } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

/**
 * La foto de un activo en el inventario: se ve como miniatura donde iría el
 * ícono del tipo, y quien administra Activos la sube tocándola (y la quita con
 * la x). Es la misma imagen que el colaborador ve en Mis entregas.
 */

// No pasa por next/image: la sirve nuestra ruta con sesión, no un CDN.
// eslint-disable-next-line @next/next/no-img-element
const Imagen = ({ src }: { src: string }) => <img src={src} alt="" className="size-full object-cover" />

export function FotoActivo({ activoId, fotoUrl, icono: Icono, puedeEditar, className }: {
  activoId: string
  fotoUrl: string | null
  icono: LucideIcon
  puedeEditar: boolean
  className?: string
}) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [ocupado, setOcupado] = useState(false)

  async function subir(archivo: File) {
    setOcupado(true)
    try {
      // Se reduce en el navegador: una foto de celular pesa 4–8 MB y para una
      // miniatura de inventario basta con 1200 px.
      const { default: comprimir } = await import('browser-image-compression')
      const reducida = await comprimir(archivo, { maxSizeMB: 0.6, maxWidthOrHeight: 1200, useWebWorker: true, fileType: 'image/jpeg' })
      const fd = new FormData()
      fd.append('archivo', new File([reducida], 'foto.jpg', { type: 'image/jpeg' }))
      const resp = await fetch(`/api/activos/${activoId}/foto`, { method: 'POST', body: fd })
      const j = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(j.error ?? 'No se pudo subir la foto.')
      toast.success('Foto guardada.')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo subir la foto.')
    } finally {
      setOcupado(false)
    }
  }

  async function quitar() {
    if (!confirm('¿Quitar la foto de este activo?')) return
    setOcupado(true)
    const resp = await fetch(`/api/activos/${activoId}/foto`, { method: 'DELETE' })
    setOcupado(false)
    if (!resp.ok) { toast.error('No se pudo quitar la foto.'); return }
    toast.success('Foto quitada.')
    router.refresh()
  }

  const marco = cn('relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-foreground text-background', className)

  if (!puedeEditar) {
    return <span className={marco}>{fotoUrl ? <Imagen src={fotoUrl} /> : <Icono className="size-[18px]" />}</span>
  }

  return (
    <span className="relative shrink-0">
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={ocupado}
        className={cn(marco, 'group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}
        aria-label={fotoUrl ? 'Cambiar la foto del activo' : 'Subir foto del activo'}
        title={fotoUrl ? 'Cambiar la foto' : 'Subir foto'}
      >
        {ocupado ? <Spinner /> : fotoUrl ? <Imagen src={fotoUrl} /> : <Icono className="size-[18px]" />}
        {!ocupado && (
          <span className="absolute inset-0 grid place-items-center bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <Camera className="size-4" />
          </span>
        )}
      </button>
      {fotoUrl && !ocupado && (
        <button
          type="button"
          onClick={quitar}
          className="absolute -right-1.5 -top-1.5 grid size-4 place-items-center rounded-full bg-background text-muted-foreground shadow ring-1 ring-border hover:text-destructive"
          aria-label="Quitar la foto"
          title="Quitar la foto"
        >
          <X className="size-3" />
        </button>
      )}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f); e.target.value = '' }} />
    </span>
  )
}
