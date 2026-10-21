'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { FileText, CircleCheck, Clock, Upload } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { adjuntarAcuerdoDescuento } from '../../acciones'
import { CampoAcuerdo, ACUERDO_VACIO, type EstadoAcuerdo } from '../campo-acuerdo'

/**
 * El acuerdo de pago en el detalle del descuento: verlo, en qué va la firma del
 * colaborador y, mientras no lo haya firmado, adjuntarlo o reemplazarlo.
 */
export function AcuerdoDescuento({ prestamoId, asunto, acuerdoDocId, firmadoDocId, requiereFirma, fechaFirma, puedeEditar }: {
  prestamoId: string
  asunto: string
  acuerdoDocId: string | null
  firmadoDocId: string | null
  requiereFirma: boolean
  fechaFirma: string | null
  puedeEditar: boolean
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [acuerdo, setAcuerdo] = useState<EstadoAcuerdo>(ACUERDO_VACIO)
  const [g, setG] = useState(false)

  async function guardar() {
    if (!acuerdo.ref) return
    setG(true)
    try {
      const res = await adjuntarAcuerdoDescuento({
        prestamoId, acuerdoRef: acuerdo.ref, requiereFirma: acuerdo.requiereFirma === true,
        posicionFirma: acuerdo.requiereFirma ? acuerdo.posicion : null,
      })
      if (!res.ok) { toast.error(res.error); return }
      toast.success(acuerdo.requiereFirma ? 'Acuerdo enviado al autoservicio del colaborador para que lo firme.' : 'Acuerdo guardado.')
      setAbierto(false); setAcuerdo(ACUERDO_VACIO); router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo subir el acuerdo.')
    } finally {
      setG(false)
    }
  }

  const ver = firmadoDocId ?? acuerdoDocId
  return (
    <div className="flex flex-wrap items-center gap-2 border-t pt-3">
      <span className="text-sm font-medium">Acuerdo de pago</span>
      {!acuerdoDocId ? (
        <span className="text-sm text-muted-foreground">Sin acuerdo</span>
      ) : fechaFirma ? (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"><CircleCheck className="size-4" /> Firmado el {fechaFirma}</span>
      ) : requiereFirma ? (
        <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"><Clock className="size-4" /> Esperando la firma del colaborador · no se descuenta hasta entonces</span>
      ) : (
        <span className="text-xs text-muted-foreground">Firmado en físico</span>
      )}
      <span className="flex-1" />
      {ver && (
        <VisorPdf documentoId={ver} titulo={`Acuerdo de pago · ${asunto}`} mimeType="application/pdf" className={buttonVariants({ size: 'sm', variant: 'outline' }) + ' gap-1.5'}>
          <FileText className="size-3.5" /> Ver
        </VisorPdf>
      )}
      {puedeEditar && !fechaFirma && (
        <Button size="sm" onClick={() => setAbierto(true)}><Upload className="size-4" /> {acuerdoDocId ? 'Reemplazar' : 'Adjuntar'}</Button>
      )}
      <Dialog open={abierto} onOpenChange={(o) => { if (!g) setAbierto(o) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{acuerdoDocId ? 'Reemplazar acuerdo de pago' : 'Adjuntar acuerdo de pago'}</DialogTitle></DialogHeader>
          <CampoAcuerdo valor={acuerdo} onCambio={setAcuerdo} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAbierto(false)} disabled={g}>Cancelar</Button>
            <Button onClick={guardar} disabled={g || acuerdo.subiendo || !acuerdo.ref}>{g && <Spinner />}Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
