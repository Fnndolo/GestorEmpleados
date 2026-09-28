'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Banknote, FileText, Paperclip } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { Pill } from '@/components/ui-kit'
import { pagarLiquidacion } from '../acciones'

/** Pago de la liquidación: se registra con fecha y comprobante, después del recibido firmado. */
export function PagoLiquidacion({ terminacionId, total, firmada, pagadaEn, comprobanteDocId, hoy, puedeEditar, cerrada }: {
  terminacionId: string
  total: string
  firmada: boolean
  pagadaEn: string | null
  comprobanteDocId: string | null
  hoy: string
  puedeEditar: boolean
  cerrada: boolean
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [fecha, setFecha] = useState(hoy)
  const [archivo, setArchivo] = useState<{ nombre: string; dataUri: string } | null>(null)
  const [g, setG] = useState(false)

  function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 8 * 1024 * 1024) { toast.error('El archivo pesa más de 8 MB.'); return }
    const lector = new FileReader()
    lector.onload = () => setArchivo({ nombre: f.name, dataUri: String(lector.result) })
    lector.readAsDataURL(f)
  }

  async function guardar() {
    if (!archivo) return
    setG(true)
    const res = await pagarLiquidacion({ id: terminacionId, fechaPago: fecha, comprobante: archivo.dataUri, nombreArchivo: archivo.nombre })
    setG(false)
    if (res.ok) { toast.success('Pago registrado.'); setAbierto(false); setArchivo(null); router.refresh() } else toast.error(res.error)
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
      <Banknote className="size-4 shrink-0 text-muted-foreground" />
      <span className="text-sm font-medium">Pago</span>
      {pagadaEn ? <Pill tone="ok">Pagada · {pagadaEn}</Pill> : <Pill tone="muted">{firmada ? 'Por pagar' : 'Después del recibido'}</Pill>}
      <span className="flex-1" />
      <div className="flex items-center gap-1.5">
        {comprobanteDocId && (
          <VisorPdf documentoId={comprobanteDocId} titulo="Comprobante de pago de la liquidación" className={buttonVariants({ size: 'sm', variant: 'outline' }) + ' gap-1.5'}>
            <FileText className="size-3.5" /> Comprobante
          </VisorPdf>
        )}
        {puedeEditar && !cerrada && (
          <Button size="sm" variant={pagadaEn ? 'ghost' : 'default'} onClick={() => setAbierto(true)} disabled={!firmada} title={firmada ? undefined : 'Primero el trabajador firma el recibido'}>
            <Banknote className="size-4" /> {pagadaEn ? 'Cambiar' : 'Registrar pago'}
          </Button>
        )}
      </div>

      <Dialog open={abierto} onOpenChange={(o) => { if (!g) setAbierto(o) }}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader><DialogTitle>Registrar pago · {total}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="fecha-pago-liq">Fecha del pago</Label>
              <Input id="fecha-pago-liq" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="comprobante-liq">Comprobante (PDF o imagen)</Label>
              <label htmlFor="comprobante-liq" className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground hover:bg-accent/50">
                <Paperclip className="size-4 shrink-0" />
                <span className="min-w-0 truncate">{archivo ? archivo.nombre : 'Elegir archivo'}</span>
              </label>
              <input id="comprobante-liq" type="file" accept="application/pdf,image/*" className="sr-only" onChange={elegir} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAbierto(false)} disabled={g}>Cancelar</Button>
            <Button onClick={guardar} disabled={g || !archivo || !fecha}>{g && <Spinner />}Registrar pago</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
