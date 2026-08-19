'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Upload, Trash2, FileText } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Ayuda } from '@/components/ui-kit/ayuda'
import { subirMembrete, quitarMembrete } from '../../empresa/acciones'

const MAX_BYTES = 2 * 1024 * 1024

const MUESTRAS = [
  { tipo: 'contrato-laboral', nombre: 'Contrato de trabajo' },
  { tipo: 'contrato-ops', nombre: 'Contrato de prestación de servicios' },
  { tipo: 'autorizacion', nombre: 'Autorización de datos' },
  { tipo: 'acuerdo', nombre: 'Acuerdo de evaluación previa' },
] as const

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
      toast.success('Membrete actualizado. Revisa las muestras para ver cómo quedó.')
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

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
      {/* Vista previa del papel */}
      <Card>
        <CardContent className="py-4">
          <div className="mb-3 flex items-center gap-2">
            <p className="text-sm font-medium">Membrete actual</p>
            <Badge variant={tieneMembrete ? 'default' : 'secondary'}>
              {tieneMembrete ? 'Propio' : 'De la aplicación'}
            </Badge>
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

          {puedeEditar && (
            <div className="mt-3 flex flex-wrap gap-2">
              <label className={buttonVariants({ variant: 'outline', size: 'sm' }) + ' cursor-pointer gap-2'}>
                {subiendo ? <Spinner /> : <Upload className="size-4" />}
                {tieneMembrete ? 'Cambiar' : 'Subir'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f); e.target.value = '' }}
                />
              </label>
              {tieneMembrete && (
                <Button size="sm" variant="ghost" onClick={quitar} disabled={subiendo}>
                  <Trash2 className="size-4" /> Quitar
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        {/* Cómo debe ser la imagen */}
        <Card>
          <CardContent className="py-4">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              Cómo debe ser la imagen
              <Ayuda texto="Es el fondo del documento: el texto del contrato se imprime encima. Por eso debe ir vacía en el centro." />
            </p>
            <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
              <li>· Tamaño carta vertical (proporción 8,5 × 11). PNG, JPG o WEBP, hasta 2 MB.</li>
              <li>· <span className="font-medium text-foreground">Sin el pie de contacto impreso.</span> La app lo escribe con los datos de Configuración → Empresa, para que cambiar el correo o el NIT no obligue a rehacer la imagen.</li>
              <li>· Deja libres unos 4 cm arriba y 2 cm abajo: ahí van el encabezado y el pie.</li>
              <li>· El centro debe quedar despejado; una marca de agua muy marcada dificulta leer el contrato.</li>
            </ul>
            {tieneMembrete && pie && (
              <p className="mt-3 rounded-md border border-dashed p-2 text-center text-[11px] text-muted-foreground">
                Pie que se imprime encima: <span className="font-medium text-foreground">{pie}</span>
              </p>
            )}
          </CardContent>
        </Card>

        {/* Muestras */}
        <Card>
          <CardContent className="py-4">
            <p className="text-sm font-medium">Ver cómo queda</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Documentos de muestra con datos ficticios. No se guarda nada: sirven para revisar si el
              texto pisa el logo o el pie.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {MUESTRAS.map((m) => (
                <a
                  key={m.tipo}
                  href={`/api/configuracion/membrete/muestra?tipo=${m.tipo}&v=${version}`}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonVariants({ variant: 'outline', size: 'sm' }) + ' justify-start gap-2'}
                >
                  <FileText className="size-4 shrink-0 text-primary" />
                  <span className="truncate">{m.nombre}</span>
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
