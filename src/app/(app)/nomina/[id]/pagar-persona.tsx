'use client'

import { reducirImagen } from '@/lib/reducir-imagen'
import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Banknote, Paperclip } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { pagarNominaPersona } from '../acciones'

/**
 * Registrar el pago de la nómina de una persona, con el comprobante de su
 * transferencia. En una ya pagada sirve para cambiar el comprobante o la fecha.
 */
export function PagarPersona({ liquidacionId, nombre, neto, periodo, hoy, pagadoEn = null }: {
  liquidacionId: string
  nombre: string
  neto: string
  periodo: string
  hoy: string
  /** Fecha del pago ya registrado (yyyy-mm-dd); null si falta pagar. */
  pagadoEn?: string | null
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [fecha, setFecha] = useState(pagadoEn ?? hoy)
  const [archivo, setArchivo] = useState<{ nombre: string; dataUri: string } | null>(null)
  const [g, setG] = useState(false)
  const pagado = !!pagadoEn

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

  async function guardar() {
    if (!archivo) return
    setG(true)
    const res = await pagarNominaPersona({ liquidacionId, fechaPago: fecha, comprobante: archivo.dataUri })
    setG(false)
    if (!res.ok) { toast.error(res.error); return }
    toast.success(pagado ? 'Comprobante actualizado.' : `Pago registrado. Le avisamos a ${nombre.split(' ')[0]}.`)
    if (!pagado && res.datos.periodoPagado) toast.success('Ya están pagados todos: el periodo quedó pagado.')
    setAbierto(false)
    setArchivo(null)
    router.refresh()
  }

  // Único por instancia: la misma persona sale en la tabla y en la lista del celular.
  const id = useId()
  return (
    <>
      {pagado ? (
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setAbierto(true)}>Cambiar</Button>
      ) : (
        <Button size="sm" onClick={() => setAbierto(true)}>
          <Banknote className="size-4" /> <span className="hidden sm:inline">Registrar pago</span><span className="sm:hidden">Pagar</span>
        </Button>
      )}
      <Dialog open={abierto} onOpenChange={(o) => { if (!g) setAbierto(o) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pagado ? 'Cambiar comprobante' : 'Registrar pago'} · {neto}</DialogTitle>
            <DialogDescription>{nombre} · nómina de {periodo}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={`fecha-${id}`}>Fecha del pago <span className="text-destructive">*</span></Label>
              <Input id={`fecha-${id}`} type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`archivo-${id}`}>Comprobante de la transferencia <span className="text-destructive">*</span></Label>
              <label htmlFor={`archivo-${id}`} className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground hover:bg-accent/50">
                <Paperclip className="size-4 shrink-0" />
                <span className="min-w-0 truncate">{archivo ? archivo.nombre : 'Elegir PDF o imagen'}</span>
              </label>
              <input id={`archivo-${id}`} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="sr-only" onChange={elegir} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAbierto(false)} disabled={g}>Cancelar</Button>
            <Button onClick={guardar} disabled={g || !archivo || !fecha}>{g && <Spinner />}{pagado ? 'Guardar' : 'Registrar pago'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
