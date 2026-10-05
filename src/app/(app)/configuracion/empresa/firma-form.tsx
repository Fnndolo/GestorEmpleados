'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Upload, Trash2, PenLine } from 'lucide-react'
import { Ayuda } from '@/components/ui-kit/ayuda'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { subirFirmaRepLegal, quitarFirmaRepLegal } from './acciones'

const MAX_BYTES = 1 * 1024 * 1024

/**
 * Firma del representante legal.
 *
 * A diferencia del membrete, aquí NO se muestra la imagen: quien la vea puede
 * descargarla y estamparla donde quiera. La pantalla solo dice si hay una
 * cargada; para comprobar que se ve bien, se genera un documento de muestra,
 * que es el único sitio donde la firma aparece en su contexto.
 */
export function FirmaRepLegalForm({
  tieneFirma, puedeEditar, repLegal,
}: {
  tieneFirma: boolean
  puedeEditar: boolean
  repLegal: string
}) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState(false)

  async function subir(file: File) {
    if (file.size > MAX_BYTES) {
      toast.error(`La imagen pesa ${(file.size / 1024).toFixed(0)} KB y el máximo es 1 MB.`)
      return
    }
    setOcupado(true)
    const datos = new FormData()
    datos.set('archivo', file)
    const res = await subirFirmaRepLegal(datos).catch(() => null)
    setOcupado(false)
    if (!res) { toast.error('No se pudo subir la firma. Intenta de nuevo.'); return }
    if (res.ok) { toast.success('Firma cargada. Los acuerdos nuevos saldrán ya firmados.'); router.refresh() }
    else toast.error(res.error)
  }

  async function quitar() {
    if (!confirm('¿Quitar la firma? Los acuerdos nuevos saldrán con la línea en blanco para firmar a mano.')) return
    setOcupado(true)
    const res = await quitarFirmaRepLegal({})
    setOcupado(false)
    if (res.ok) { toast.success('Firma eliminada.'); router.refresh() }
    else toast.error(res.error)
  }

  return (
    <Card className="mt-4 py-0">
      <CardContent className="space-y-3 p-4 sm:p-5">
        <div className="flex items-center gap-1.5">
          <PenLine className="size-4 shrink-0 text-muted-foreground" />
          <p className="min-w-0 truncate text-sm font-semibold">Firma del representante legal</p>
          <Ayuda
            etiqueta="Sobre la firma"
            texto={`${tieneFirma
              ? `Los acuerdos de evaluación previa salen ya firmados por ${repLegal || 'el representante legal'}, así el aspirante solo pone la suya.`
              : 'Sin firma cargada, los acuerdos salen con la línea en blanco para firmarlos a mano.'} Usa PNG o WEBP con fondo transparente (un JPG pinta un recuadro blanco), hasta 1 MB. La imagen no se muestra ni se descarga en ninguna pantalla: solo se usa al generar el PDF, y cambiarla queda en auditoría. Para ver cómo queda, abre una muestra en Plantillas.`}
          />
          <span className="flex-1" />
          <Badge variant={tieneFirma ? 'default' : 'secondary'}>{tieneFirma ? 'Cargada' : 'Sin cargar'}</Badge>
        </div>
        <p className="truncate text-xs text-muted-foreground">PNG o WEBP transparente, hasta 1 MB.</p>
        {puedeEditar && (
          <div className="flex items-center gap-2">
            <label className={buttonVariants({ size: 'sm' }) + ' cursor-pointer gap-2 max-sm:flex-1'}>
              {ocupado ? <Spinner /> : <Upload className="size-4" />}
              {tieneFirma ? 'Reemplazar firma' : 'Cargar firma'}
              <input
                type="file"
                accept="image/png,image/webp"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f); e.target.value = '' }}
              />
            </label>
            {tieneFirma && (
              <Button size="icon" variant="outline" onClick={quitar} disabled={ocupado} aria-label="Quitar firma" title="Quitar firma">
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
