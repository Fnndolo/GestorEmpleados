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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SelectorColaborador } from '@/components/colaboradores/selector-colaborador'
import { crearTerminacion } from './acciones'

const TIPOS = [
  { v: 'RENUNCIA_VOLUNTARIA', l: 'Renuncia voluntaria' },
  { v: 'SIN_JUSTA_CAUSA', l: 'Sin justa causa' },
  { v: 'CON_JUSTA_CAUSA', l: 'Con justa causa' },
  { v: 'TERMINACION_ANTICIPADA', l: 'Terminación anticipada' },
  { v: 'MUTUO_ACUERDO', l: 'Mutuo acuerdo' },
  { v: 'VENCIMIENTO_PLAZO', l: 'Vencimiento del plazo' },
  { v: 'PERIODO_PRUEBA', l: 'Periodo de prueba' },
  { v: 'FIN_OPS', l: 'Fin contrato OPS' },
]

export function NuevaTerminacion() {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [colaboradorId, setColaboradorId] = useState('')
  const [tipo, setTipo] = useState('RENUNCIA_VOLUNTARIA')
  const [fechaRetiro, setFechaRetiro] = useState(new Date().toISOString().slice(0, 10))
  const [preavisoDias, setPreavisoDias] = useState('')
  const [motivo, setMotivo] = useState('')
  const [g, setG] = useState(false)

  async function crear() {
    if (!colaboradorId) { toast.error('Selecciona un colaborador.'); return }
    setG(true)
    const res = await crearTerminacion({ colaboradorId, tipo: tipo as 'RENUNCIA_VOLUNTARIA', fechaRetiro, preavisoDias: preavisoDias ? Number(preavisoDias) : undefined, motivo })
    setG(false)
    if (res.ok) { toast.success('Terminación registrada y liquidación calculada.'); setAbierto(false); router.push(`/terminaciones/${(res.datos as { id: string }).id}`) }
    else toast.error(res.error)
  }

  return (
    <>
      <Button size="sm" onClick={() => setAbierto(true)}><Plus className="size-4" /> Registrar terminación</Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar terminación</DialogTitle>
            <DialogDescription>Se calculará la liquidación definitiva y se generará el paz y salvo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Colaborador</Label><SelectorColaborador value={colaboradorId} onChange={(id) => setColaboradorId(id)} /></div>
            <div className="space-y-1.5">
              <Label>Tipo de terminación</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{TIPOS.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Fecha de retiro</Label><Input type="date" value={fechaRetiro} onChange={(e) => setFechaRetiro(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Preaviso (días)</Label><Input type="number" value={preavisoDias} onChange={(e) => setPreavisoDias(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label>Motivo / observaciones</Label><Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button onClick={crear} disabled={g}>{g && <Spinner />}Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
