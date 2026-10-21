'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Paperclip, X, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { SelectorFirmasPdf, type Posicion } from '@/components/contratos/selector-firmas-pdf'
import { Checkbox } from '@/components/ui/checkbox'
import { subirPdfTemporal } from '@/lib/archivos'
import { usePdfLocal } from '@/lib/use-pdf-local'
import { Ayuda } from '@/components/ui-kit/ayuda'
import { analizarAcuerdoDescuento } from '../acciones'

/** Lo que el formulario necesita del acuerdo para guardarlo. */
export type EstadoAcuerdo = {
  /** Referencia del PDF ya subido al depósito temporal; null sin acuerdo o mientras sube. */
  ref: string | null
  requiereFirma: boolean | null
  posicion: Posicion | null
  subiendo: boolean
}

export const ACUERDO_VACIO: EstadoAcuerdo = { ref: null, requiereFirma: null, posicion: null, subiendo: false }

/** Recuadro de firma por defecto (≈5 × 1.6 cm), abajo a la derecha de la última página. */
const POR_DEFECTO: Posicion = { pagina: 1, x: 330, y: 120, ancho: 150, alto: 45 }
const ETIQUETAS = { contratista: 'Firma del colaborador', contratante: '' }

/**
 * El acuerdo de pago del descuento (PDF). Se sube apenas se elige para poder
 * leerlo; si el colaborador debe firmarlo, se ve el documento con el recuadro
 * de su firma —propuesto leyendo el PDF— para dejarlo donde va.
 */
export function CampoAcuerdo({ valor, onCambio }: { valor: EstadoAcuerdo; onCambio: (v: EstadoAcuerdo) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [pdf, setPdf] = usePdfLocal()
  const [paginas, setPaginas] = useState(1)
  const [propuesta, setPropuesta] = useState<Posicion | null>(null)
  const [version, setVersion] = useState(0)

  async function elegir(f: File | null) {
    setArchivo(f); setPdf(f); setPropuesta(null)
    if (!f) { onCambio(ACUERDO_VACIO); return }
    onCambio({ ...ACUERDO_VACIO, subiendo: true })
    try {
      const ref = await subirPdfTemporal(f)
      const res = await analizarAcuerdoDescuento({ acuerdoRef: ref })
      if (!res.ok) throw new Error(res.error)
      const pos = res.datos.posicion ?? { ...POR_DEFECTO, pagina: res.datos.paginas }
      setPaginas(res.datos.paginas); setPropuesta(pos); setVersion((v) => v + 1)
      onCambio({ ref, requiereFirma: true, posicion: pos, subiendo: false })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo leer el PDF.')
      setArchivo(null); setPdf(null); onCambio(ACUERDO_VACIO)
    }
  }

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5">
        Acuerdo de pago
        <Ayuda texto="El soporte del descuento en PDF. La ley exige la autorización escrita del trabajador para descontarle de la nómina (CST art. 149). Si debe firmarlo, le llega a su autoservicio y el descuento no entra en la nómina hasta que lo firme." />
      </Label>
      <input ref={input} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { void elegir(e.target.files?.[0] ?? null); e.target.value = '' }} />
      {archivo ? (
        <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          {valor.subiendo ? <Spinner /> : <Paperclip className="size-4 shrink-0 text-muted-foreground" />}
          <span className="min-w-0 flex-1 truncate">{archivo.name}</span>
          <VisorPdf archivo={archivo} titulo={archivo.name} mimeType="application/pdf" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline">
            <Eye className="size-3.5" /> Ver
          </VisorPdf>
          <button type="button" aria-label="Quitar el acuerdo" className="shrink-0 text-destructive" disabled={valor.subiendo} onClick={() => void elegir(null)}><X className="size-4" /></button>
        </div>
      ) : (
        <Button type="button" size="sm" variant="outline" onClick={() => input.current?.click()}><Paperclip className="size-4" /> Adjuntar PDF</Button>
      )}
      {archivo && !valor.subiendo && valor.ref && (
        // Sin marcar, el colaborador lo firma en su autoservicio (y abajo se ubica su firma).
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={valor.requiereFirma === false} onCheckedChange={(v) => onCambio({ ...valor, requiereFirma: v !== true })} />
          Ya viene firmado
        </label>
      )}
      {pdf && valor.requiereFirma && propuesta && (
        <div className="space-y-1">
          <SelectorFirmasPdf
            key={version}
            pdfDataUri={pdf}
            paginas={paginas}
            valor={{ contratista: valor.posicion ?? propuesta, contratante: propuesta }}
            onChange={(v) => onCambio({ ...valor, posicion: v.contratista })}
            partes={['contratista']}
            etiquetas={ETIQUETAS}
          />
        </div>
      )}
    </div>
  )
}
