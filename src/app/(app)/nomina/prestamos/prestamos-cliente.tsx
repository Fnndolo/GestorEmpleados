'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SelectorColaborador } from '@/components/colaboradores/selector-colaborador'
import { BotonAgregar } from '@/components/ui-kit/boton-agregar'
import { fmtCOP } from '@/lib/moneda'
import { registrarPrestamo } from '../acciones'
import { CampoAcuerdo, ACUERDO_VACIO, type EstadoAcuerdo } from './campo-acuerdo'

const obligatorio = <span className="text-destructive">*</span>

/** El mes que viene por defecto: el actual («2026-10»). */
const mesActual = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }).slice(0, 7)

export function PrestamosCliente({ puedeCrear }: { puedeCrear: boolean }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [colaboradorId, setColaboradorId] = useState('')
  const [asunto, setAsunto] = useState('')
  const [valorTotal, setValorTotal] = useState('')
  const [numeroCuotas, setNumeroCuotas] = useState('1')
  const [mesInicio, setMesInicio] = useState(mesActual())
  const [acuerdo, setAcuerdo] = useState<EstadoAcuerdo>(ACUERDO_VACIO)
  const [g, setG] = useState(false)

  const cuota = valorTotal && Number(numeroCuotas) > 0 ? Math.round(Number(valorTotal) / Number(numeroCuotas)) : 0

  function limpiar() {
    setColaboradorId(''); setAsunto(''); setValorTotal(''); setNumeroCuotas('1'); setMesInicio(mesActual())
    setAcuerdo(ACUERDO_VACIO)
  }

  async function guardar() {
    if (!colaboradorId) { toast.error('Selecciona un colaborador.'); return }
    if (asunto.trim().length < 3) { toast.error('Escribe el asunto del descuento.'); return }
    if (acuerdo.subiendo) { toast.error('Espera a que termine de subir el acuerdo.'); return }
    setG(true)
    try {
      const res = await registrarPrestamo({
        colaboradorId, valorTotal: Number(valorTotal), numeroCuotas: Number(numeroCuotas), mesInicio,
        descripcion: asunto.trim(), acuerdoRef: acuerdo.ref, requiereFirma: acuerdo.requiereFirma === true,
        posicionFirma: acuerdo.requiereFirma ? acuerdo.posicion : null,
      })
      if (!res.ok) { toast.error(res.error); return }
      toast.success(acuerdo.requiereFirma ? 'Descuento registrado. Se le pidió al colaborador que firme el acuerdo.' : 'Descuento registrado.')
      setAbierto(false); limpiar(); router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo subir el acuerdo.')
    } finally {
      setG(false)
    }
  }

  if (!puedeCrear) return null
  return (
    <>
      <BotonAgregar etiqueta="Nuevo descuento" onClick={() => setAbierto(true)} />
      <Dialog open={abierto} onOpenChange={(o) => { if (!g) setAbierto(o) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Nuevo descuento</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Colaborador {obligatorio}</Label><SelectorColaborador value={colaboradorId} onChange={(id) => setColaboradorId(id)} /></div>
            <div className="space-y-1.5">
              <Label htmlFor="desc-asunto">Asunto del descuento {obligatorio}</Label>
              <Input id="desc-asunto" value={asunto} maxLength={300} placeholder="Préstamo, anticipo, daño de equipo…" onChange={(e) => setAsunto(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor="desc-valor">Valor total {obligatorio}</Label><Input id="desc-valor" type="number" inputMode="numeric" value={valorTotal} onChange={(e) => setValorTotal(e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="desc-cuotas">Número de cuotas {obligatorio}</Label><Input id="desc-cuotas" type="number" inputMode="numeric" value={numeroCuotas} onChange={(e) => setNumeroCuotas(e.target.value)} /></div>
            </div>
            {cuota > 0 && <p className="text-sm text-muted-foreground">Cuota mensual: <b>{fmtCOP(cuota)}</b></p>}
            <div className="space-y-1.5">
              <Label htmlFor="desc-mes">Mes en que empieza a descontarse {obligatorio}</Label>
              <Input id="desc-mes" type="month" value={mesInicio} onChange={(e) => setMesInicio(e.target.value)} />
            </div>
            <CampoAcuerdo valor={acuerdo} onCambio={setAcuerdo} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAbierto(false)} disabled={g}>Cancelar</Button>
            <Button onClick={guardar} disabled={g || acuerdo.subiendo}>{g && <Spinner />}Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
