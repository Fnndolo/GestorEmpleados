'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SelectorColaborador } from '@/components/colaboradores/selector-colaborador'
import { fmtCOP } from '@/lib/moneda'
import { registrarPrestamo } from '../acciones'

export function PrestamosCliente({ puedeCrear }: { puedeCrear: boolean }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [colaboradorId, setColaboradorId] = useState('')
  const [valorTotal, setValorTotal] = useState('')
  const [numeroCuotas, setNumeroCuotas] = useState('1')
  const [fechaInicio, setFechaInicio] = useState(new Date().toISOString().slice(0, 10))
  const [descripcion, setDescripcion] = useState('')
  const [g, setG] = useState(false)

  const cuota = valorTotal && Number(numeroCuotas) > 0 ? Math.round(Number(valorTotal) / Number(numeroCuotas)) : 0

  async function guardar() {
    if (!colaboradorId) { toast.error('Selecciona un colaborador.'); return }
    setG(true)
    const res = await registrarPrestamo({ colaboradorId, valorTotal: Number(valorTotal), numeroCuotas: Number(numeroCuotas), fechaInicio, descripcion })
    setG(false)
    if (res.ok) { toast.success('Préstamo registrado.'); setAbierto(false); router.refresh() } else toast.error(res.error)
  }

  if (!puedeCrear) return null
  return (
    <div className="flex justify-end">
      <Button size="sm" onClick={() => setAbierto(true)}><Plus className="size-4" /> Nuevo préstamo</Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuevo préstamo</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Colaborador</Label><SelectorColaborador value={colaboradorId} onChange={(id) => setColaboradorId(id)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Valor total</Label><Input type="number" value={valorTotal} onChange={(e) => setValorTotal(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Número de cuotas</Label><Input type="number" value={numeroCuotas} onChange={(e) => setNumeroCuotas(e.target.value)} /></div>
            </div>
            {cuota > 0 && <p className="text-sm text-muted-foreground">Cuota mensual: <b>{fmtCOP(cuota)}</b></p>}
            <div className="space-y-1.5"><Label>Fecha de inicio</Label><Input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Descripción</Label><Textarea rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button onClick={guardar} disabled={g}>{g && <Spinner />}Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
