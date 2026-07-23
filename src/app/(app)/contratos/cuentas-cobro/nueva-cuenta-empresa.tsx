'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Receipt } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SelectorColaborador } from '@/components/colaboradores/selector-colaborador'
import { crearCuentaCobroEmpresa } from '../ops-acciones'

export function NuevaCuentaEmpresa({ plantillas }: { plantillas: { id: string; nombre: string }[] }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [colaboradorId, setColaboradorId] = useState('')
  const [periodo, setPeriodo] = useState('')
  const [valor, setValor] = useState('')
  const [concepto, setConcepto] = useState('')
  const [plantillaId, setPlantillaId] = useState('')
  const [g, setG] = useState(false)

  async function crear() {
    if (!colaboradorId) { toast.error('Selecciona el colaborador o contratista.'); return }
    if (!periodo) { toast.error('Indica el periodo (AAAA-MM).'); return }
    if (!valor || Number(valor) <= 0) { toast.error('Indica el valor.'); return }
    setG(true)
    const res = await crearCuentaCobroEmpresa({
      colaboradorId, periodo, valor: Number(valor),
      concepto: concepto.trim() || undefined,
      plantillaId: plantillaId || undefined,
    })
    setG(false)
    if (!res.ok) { toast.error(res.error); return }
    const r = res.datos as { numero: string; vinculadaOps: boolean }
    toast.success(`Cuenta ${r.numero} radicada.${r.vinculadaOps ? ' Quedó ligada al contrato OPS: requiere planilla PILA verificada antes de aprobar.' : ''}`)
    setAbierto(false)
    setColaboradorId(''); setPeriodo(''); setValor(''); setConcepto(''); setPlantillaId('')
    router.refresh()
  }

  return (
    <>
      <Button size="sm" onClick={() => setAbierto(true)}><Plus className="size-4" /> Radicar cuenta</Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Receipt className="size-4" /> Radicar cuenta de cobro</DialogTitle>
            <DialogDescription>
              La empresa la radica a nombre del colaborador o contratista; él recibe la notificación para revisarla (y adjuntar su planilla PILA si es OPS).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Colaborador / contratista</Label>
              <SelectorColaborador value={colaboradorId} onChange={setColaboradorId} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Periodo</Label>
                <Input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Valor</Label>
                <Input type="number" step="1" min="1" value={valor} onChange={(e) => setValor(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Concepto (opcional)</Label>
              <Textarea rows={2} value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Honorarios del mes, comisiones, saldo a favor…" />
            </div>
            {plantillas.length > 0 && (
              <div className="space-y-1.5">
                <Label>Plantilla del PDF</Label>
                <Select value={plantillaId} onValueChange={setPlantillaId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Plantilla por defecto" /></SelectTrigger>
                  <SelectContent>
                    {plantillas.map((p) => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button onClick={crear} disabled={g}>{g && <Spinner />} Radicar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
