'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Upload, Trash2 } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Ayuda } from '@/components/ui-kit/ayuda'
import { subirMembrete, quitarMembrete } from '../../empresa/acciones'

const MAX_BYTES = 2 * 1024 * 1024

export function MembretePanel({
  tieneMembrete, puedeEditar, pie,
}: {
  tieneMembrete: boolean
  puedeEditar: boolean
  /** Línea que la app imprime sobre el membrete propio (correo · NIT · web). */
  pie: string
}) {
  const router = useRouter()
  const [subiendo, setSubiendo] = useState(false)
  // Cambia al recargar para que el navegador no muestre la imagen anterior en caché.
  const [version, setVersion] = useState(0)

  async function subir(file: File) {
    if (file.size > MAX_BYTES) {
      toast.error(`La imagen pesa ${(file.size / 1024 / 1024).toFixed(1)} MB y el máximo son 2 MB.`)
      return
    }
    setSubiendo(true)
    const datos = new FormData()
    datos.set('archivo', file)
    const res = await subirMembrete(datos).catch(() => null)
    setSubiendo(false)
    if (!res) { toast.error('No se pudo subir la imagen. Intenta de nuevo.'); return }
    if (res.ok) {
      toast.success('Membrete actualizado.')
      setVersion((v) => v + 1)
      router.refresh()
    } else toast.error(res.error)
  }

  async function quitar() {
    if (!confirm('¿Volver al membrete que trae la aplicación?')) return
    setSubiendo(true)
    const res = await quitarMembrete({})
    setSubiendo(false)
    if (res.ok) {
      toast.success('Se restauró el membrete de la aplicación.')
      setVersion((v) => v + 1)
      router.refresh()
    } else toast.error(res.error)
  }

  // Las recomendaciones van en el ícono de ayuda: el panel es solo la imagen.
  const ayuda =
    'Es el fondo de los documentos: el texto se imprime encima. Tamaño carta vertical (8,5 × 11), PNG, JPG o WEBP, hasta 2 MB. ' +
    'Sin el pie de contacto impreso: la app lo escribe con los datos de la empresa. ' +
    'Deja libres unos 4 cm arriba y 2 cm abajo, y el centro despejado.' +
    (tieneMembrete && pie ? ` Pie que se imprime: ${pie}.` : '')

  return (
    <div className="mx-auto w-full max-w-xs space-y-3">
      <div className="flex items-center gap-2">
        <Badge variant={tieneMembrete ? 'default' : 'secondary'}>{tieneMembrete ? 'Propio' : 'De la app'}</Badge>
        <Ayuda texto={ayuda} etiqueta="Cómo debe ser la imagen" />
        {puedeEditar && (
          <div className="ml-auto flex items-center gap-1">
            <label
              className={buttonVariants({ size: 'sm' }) + ' cursor-pointer gap-2'}
              title={tieneMembrete ? 'Cambiar imagen' : 'Subir imagen'}
              aria-label={tieneMembrete ? 'Cambiar imagen' : 'Subir imagen'}
            >
              {subiendo ? <Spinner /> : <Upload className="size-4" />}
              <span className="hidden sm:inline">{tieneMembrete ? 'Cambiar' : 'Subir'}</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f); e.target.value = '' }}
              />
            </label>
            {tieneMembrete && (
              <Button size="icon" variant="ghost" onClick={quitar} disabled={subiendo} aria-label="Quitar (volver al de la app)" title="Quitar (volver al de la app)">
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        )}
      </div>
      {/* Proporción carta (8.5 × 11) para que se vea tal como saldrá. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={version}
        src={`/api/configuracion/membrete?v=${version}`}
        alt="Papel membretado actual"
        className="w-full rounded-md border bg-white"
        style={{ aspectRatio: '8.5 / 11', objectFit: 'contain' }}
      />
    </div>
  )
}
