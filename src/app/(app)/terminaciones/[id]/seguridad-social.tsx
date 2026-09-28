'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { FileText, ShieldCheck, Upload } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { Pill } from '@/components/ui-kit'
import { subirSeguridadSocial } from '../acciones'
import { ArchivoInput } from '@/components/documentos/archivo-input'

/**
 * Paso "Seguridad social": el soporte del pago de los aportes de los últimos
 * tres meses (art. 65 CST, parágrafo 1). Al subirlo, le queda al trabajador en
 * su autoservicio.
 */
export function SeguridadSocial({ terminacionId, docId, puedeEditar, cerrada }: {
  terminacionId: string; docId: string | null; puedeEditar: boolean; cerrada: boolean
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [archivo, setArchivo] = useState<{ nombre: string; dataUri: string } | null>(null)
  const [g, setG] = useState(false)

  async function guardar() {
    if (!archivo) return
    setG(true)
    const res = await subirSeguridadSocial({ id: terminacionId, archivo: archivo.dataUri })
    setG(false)
    if (res.ok) { toast.success('Soporte cargado: ya lo tiene el trabajador.'); setAbierto(false); setArchivo(null); router.refresh() } else toast.error(res.error)
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
      <ShieldCheck className="size-4 shrink-0 text-muted-foreground" />
      <span className="text-sm font-medium">Aportes de los últimos 3 meses</span>
      {docId ? <Pill tone="ok">Entregado</Pill> : <Pill tone="muted">Por cargar</Pill>}
      <span className="flex-1" />
      <div className="flex items-center gap-1.5">
        {docId && (
          <VisorPdf documentoId={docId} titulo="Soporte de aportes a seguridad social" className={buttonVariants({ size: 'sm', variant: 'outline' }) + ' gap-1.5'}>
            <FileText className="size-3.5" /> Ver
          </VisorPdf>
        )}
        {puedeEditar && !cerrada && (
          <Button size="sm" variant={docId ? 'ghost' : 'default'} onClick={() => setAbierto(true)}>
            <Upload className="size-4" /> {docId ? 'Cambiar' : 'Cargar'}
          </Button>
        )}
      </div>

      <Dialog open={abierto} onOpenChange={(o) => { if (!g) setAbierto(o) }}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader><DialogTitle>Soporte de seguridad social</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Planilla o certificado del pago de salud, pensión y ARL de los últimos tres meses.</p>
          <ArchivoInput id="soporte-ss" archivo={archivo} onArchivo={setArchivo} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAbierto(false)} disabled={g}>Cancelar</Button>
            <Button onClick={guardar} disabled={g || !archivo}>{g && <Spinner />}Cargar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
