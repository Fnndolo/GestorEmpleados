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
import { pagarCuentaCobro } from '../acciones'

/**
 * Registrar el pago de una cuenta de cobro aprobada, con el comprobante de la
 * transferencia, desde la lista de lo que falta por pagar. En una ya pagada
 * sirve para cambiar el comprobante o la fecha.
 */
export function PagarCuenta({ cuentaId, numero, nombre, valor, hoy, pagada = false, conComprobante = false, fechaPago = null }: {
  cuentaId: string
  numero: string
  nombre: string
  valor: string
  hoy: string
  pagada?: boolean
  /** Ya pagada y con comprobante: el botón es para cambiarlo; sin él, para subirlo. */
  conComprobante?: boolean
  /** Fecha ya registrada (yyyy-mm-dd) de una cuenta pagada: se propone esa y no la de hoy. */
  fechaPago?: string | null
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [fecha, setFecha] = useState(fechaPago ?? hoy)
  const [archivo, setArchivo] = useState<{ nombre: string; dataUri: string } | null>(null)
  const [g, setG] = useState(false)
  // Único por instancia, para que la etiqueta abra el selector de ESTE diálogo.
  const uid = useId()

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
    const res = await pagarCuentaCobro({ id: cuentaId, fechaPago: fecha, comprobante: archivo.dataUri })
    setG(false)
    if (res.ok) {
      toast.success(pagada ? 'Comprobante actualizado.' : 'Pago registrado. Le avisamos al contratista.')
      setAbierto(false)
      setArchivo(null)
      router.refresh()
    } else toast.error(res.error)
  }

  return (
    <>
      {pagada ? (
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setAbierto(true)}>{conComprobante ? 'Cambiar' : 'Subir comprobante'}</Button>
      ) : (
        <Button size="sm" onClick={() => setAbierto(true)}>
          <Banknote className="size-4" /> Registrar pago
        </Button>
      )}
      <Dialog open={abierto} onOpenChange={(o) => { if (!g) setAbierto(o) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pagada ? (conComprobante ? 'Cambiar comprobante' : 'Subir comprobante') : 'Registrar pago'} · {valor}</DialogTitle>
            <DialogDescription>{nombre} · {numero}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={`fecha-${uid}`}>Fecha del pago <span className="text-destructive">*</span></Label>
              <Input id={`fecha-${uid}`} type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`comprobante-${uid}`}>Comprobante de la transferencia <span className="text-destructive">*</span></Label>
              <label htmlFor={`comprobante-${uid}`} className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground hover:bg-accent/50">
                <Paperclip className="size-4 shrink-0" />
                <span className="min-w-0 truncate">{archivo ? archivo.nombre : 'Elegir PDF o imagen'}</span>
              </label>
              <input id={`comprobante-${uid}`} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="sr-only" onChange={elegir} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAbierto(false)} disabled={g}>Cancelar</Button>
            <Button onClick={guardar} disabled={g || !archivo || !fecha}>{g && <Spinner />}{pagada ? 'Guardar' : 'Registrar pago'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
