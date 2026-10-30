'use client'

import { reducirImagen } from '@/lib/reducir-imagen'
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
import { pagarLiquidacion, adjuntarComprobanteLiquidacion } from '../acciones'

type Archivo = { nombre: string; dataUri: string }

/**
 * Pago de la liquidación: se registra con la fecha (no espera el recibido
 * firmado). El comprobante es un soporte: se adjunta en el momento o después
 * ("Adjuntar comprobante"), y se puede reemplazar ("Cambiar").
 */
export function PagoLiquidacion({ terminacionId, total, pagadaEn, pagadaISO, comprobanteDocId, hoy, puedeEditar, cerrada }: {
  terminacionId: string
  total: string
  /** Fecha del pago ya registrado, en texto largo; null si falta. */
  pagadaEn: string | null
  /** La misma fecha en yyyy-mm-dd, para precargar el diálogo. */
  pagadaISO: string | null
  comprobanteDocId: string | null
  hoy: string
  puedeEditar: boolean
  cerrada: boolean
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState<'pago' | 'comprobante' | null>(null)
  const [fecha, setFecha] = useState(pagadaISO ?? hoy)
  const [archivo, setArchivo] = useState<Archivo | null>(null)
  const [g, setG] = useState(false)
  const editable = puedeEditar && !cerrada

  async function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const elegido = e.target.files?.[0]
    e.target.value = ''
    if (!elegido) return
    // Viaja dentro de la acción (tope de 4 MB, y en base64 pesa un tercio más): las fotos
    // se achican antes; un PDF de más de 3 MB no cabría.
    const f = await reducirImagen(elegido)
    if (f.size > 3 * 1024 * 1024) { toast.error('El archivo pesa más de 3 MB. Toma una foto o expórtalo más liviano.'); return }
    const lector = new FileReader()
    lector.onload = () => setArchivo({ nombre: f.name, dataUri: String(lector.result) })
    lector.readAsDataURL(f)
  }

  function cerrar() { setAbierto(null); setArchivo(null) }

  async function registrar() {
    if (!fecha) return
    setG(true)
    const res = await pagarLiquidacion({ id: terminacionId, fechaPago: fecha, comprobante: archivo?.dataUri })
    setG(false)
    if (!res.ok) { toast.error(res.error); return }
    toast.success(pagadaEn ? 'Pago actualizado.' : archivo ? 'Pago registrado.' : 'Pago registrado. El comprobante se puede adjuntar después.')
    cerrar()
    router.refresh()
  }

  async function adjuntar() {
    if (!archivo) return
    setG(true)
    const res = await adjuntarComprobanteLiquidacion({ id: terminacionId, comprobante: archivo.dataUri })
    setG(false)
    if (!res.ok) { toast.error(res.error); return }
    toast.success('Comprobante guardado.')
    cerrar()
    router.refresh()
  }

  const selector = (id: string) => (
    <>
      <label htmlFor={id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground hover:bg-accent/50">
        <Paperclip className="size-4 shrink-0" />
        <span className="min-w-0 truncate">{archivo ? archivo.nombre : 'Elegir PDF o imagen'}</span>
      </label>
      <input id={id} type="file" accept="application/pdf,image/*" className="sr-only" onChange={elegir} />
    </>
  )

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
      <Banknote className="size-4 shrink-0 text-muted-foreground" />
      <span className="text-sm font-medium">Pago</span>
      {pagadaEn ? <Pill tone="ok">Pagada · {pagadaEn}</Pill> : <Pill tone="muted">Por pagar</Pill>}
      {pagadaEn && !comprobanteDocId && <Pill tone="warn">Sin comprobante</Pill>}
      <span className="flex-1" />
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {comprobanteDocId && (
          <VisorPdf documentoId={comprobanteDocId} titulo="Comprobante de pago de la liquidación" className={buttonVariants({ size: 'sm', variant: 'outline' }) + ' gap-1.5'}>
            <FileText className="size-3.5" /> Comprobante
          </VisorPdf>
        )}
        {editable && pagadaEn && (
          <Button size="sm" variant={comprobanteDocId ? 'ghost' : 'default'} onClick={() => setAbierto('comprobante')}>
            <Paperclip className="size-4" /> {comprobanteDocId ? 'Cambiar' : 'Adjuntar comprobante'}
          </Button>
        )}
        {editable && (
          <Button size="sm" variant={pagadaEn ? 'ghost' : 'default'} onClick={() => setAbierto('pago')}>
            <Banknote className="size-4" /> {pagadaEn ? 'Corregir fecha' : 'Registrar pago'}
          </Button>
        )}
      </div>

      {/* Registrar el pago (o corregir su fecha); el comprobante va si se tiene a la mano. */}
      <Dialog open={abierto === 'pago'} onOpenChange={(o) => { if (!g && !o) cerrar() }}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{pagadaEn ? 'Corregir fecha del pago' : 'Registrar pago'} · {total}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="fecha-pago-liq">Fecha del pago <span className="text-destructive">*</span></Label>
              <Input id="fecha-pago-liq" type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} />
            </div>
            {!pagadaEn && (
              <div className="space-y-1.5">
                <Label htmlFor="comprobante-liq">Comprobante (PDF o imagen)</Label>
                {selector('comprobante-liq')}
                {!archivo && <p className="text-[11px] text-muted-foreground">Se puede adjuntar después desde este mismo paso.</p>}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={cerrar} disabled={g}>Cancelar</Button>
            <Button onClick={registrar} disabled={g || !fecha || (!!pagadaEn && fecha === pagadaISO)}>{g && <Spinner />}{pagadaEn ? 'Guardar' : 'Registrar pago'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjuntar o reemplazar el comprobante de un pago ya registrado. */}
      <Dialog open={abierto === 'comprobante'} onOpenChange={(o) => { if (!g && !o) cerrar() }}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{comprobanteDocId ? 'Cambiar comprobante' : 'Adjuntar comprobante'} · {total}</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="comprobante-liq-adj">Comprobante (PDF o imagen) <span className="text-destructive">*</span></Label>
            {selector('comprobante-liq-adj')}
            {comprobanteDocId && <p className="text-[11px] text-muted-foreground">El comprobante anterior se reemplaza.</p>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={cerrar} disabled={g}>Cancelar</Button>
            <Button onClick={adjuntar} disabled={g || !archivo}>{g && <Spinner />}Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
