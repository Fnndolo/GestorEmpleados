'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Upload, Trash2, PenLine, ShieldAlert } from 'lucide-react'
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
    <Card className="mt-4">
      <CardContent className="py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <PenLine className="size-4 text-muted-foreground" /> Firma del representante legal
              </p>
              <Badge variant={tieneFirma ? 'default' : 'secondary'}>
                {tieneFirma ? 'Cargada' : 'Sin cargar'}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {tieneFirma
                ? `Los acuerdos de evaluación previa salen ya firmados por ${repLegal || 'el representante legal'}, así el aspirante solo pone la suya.`
                : 'Sin firma cargada, los acuerdos salen con la línea en blanco para firmarlos a mano.'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              PNG o WEBP <span className="font-medium">con fondo transparente</span>, hasta 1 MB. Un JPG
              pintaría un recuadro blanco sobre la línea.
            </p>

            <p className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-amber-800 dark:text-amber-300">
              <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
              <span>
                La imagen no se muestra ni se puede descargar desde ninguna pantalla: solo se usa al
                generar el PDF. Cambiarla o quitarla exige permiso de edición y queda registrado en
                auditoría. Para ver cómo queda, abre un documento de muestra en Plantillas.
              </span>
            </p>
          </div>

          {puedeEditar && (
            <div className="flex shrink-0 items-center gap-2">
              <label className={buttonVariants({ variant: 'outline', size: 'sm' }) + ' cursor-pointer gap-2'}>
                {ocupado ? <Spinner /> : <Upload className="size-4" />}
                {tieneFirma ? 'Reemplazar' : 'Cargar firma'}
                <input
                  type="file"
                  accept="image/png,image/webp"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f); e.target.value = '' }}
                />
              </label>
              {tieneFirma && (
                <Button size="icon" variant="ghost" onClick={quitar} disabled={ocupado} aria-label="Quitar firma">
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
