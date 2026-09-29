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
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SelectorColaborador } from '@/components/colaboradores/selector-colaborador'
import { crearCuentaCobroEmpresa } from '../ops-acciones'

/** Datos con los que abre el formulario (desde Pagos OPS → Sin radicar). */
export type CuentaInicial = { colaboradorId: string; nombre: string; periodo: string; valor: number | null; concepto: string }

/**
 * La empresa radica una cuenta de cobro a nombre del colaborador o contratista.
 * Con `inicial` abre ya diligenciada para esa persona y ese mes, con un botón
 * pequeño: es como se usa desde la lista de quienes aún no radican.
 */
export function NuevaCuentaEmpresa({ plantillas, inicial }: { plantillas: { id: string; nombre: string }[]; inicial?: CuentaInicial }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [colaboradorId, setColaboradorId] = useState(inicial?.colaboradorId ?? '')
  const [periodo, setPeriodo] = useState(inicial?.periodo ?? '')
  const [valor, setValor] = useState(inicial?.valor ? String(inicial.valor) : '')
  const [concepto, setConcepto] = useState(inicial?.concepto ?? '')
  const [plantillaId, setPlantillaId] = useState('')
  // Por ahora la PILA es opcional: se pide solo si se marca.
  const [pedirPila, setPedirPila] = useState(false)
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
      requierePila: pedirPila,
    })
    setG(false)
    if (!res.ok) { toast.error(res.error); return }
    const r = res.datos as { numero: string; pidePila: boolean }
    toast.success(`Cuenta ${r.numero} radicada.${r.pidePila ? ' Se aprueba cuando su planilla PILA esté verificada.' : ''}`)
    setAbierto(false)
    if (!inicial) { setColaboradorId(''); setPeriodo(''); setValor(''); setConcepto('') }
    setPlantillaId('')
    setPedirPila(false)
    router.refresh()
  }

  return (
    <>
      {inicial ? (
        <Button size="sm" variant="outline" onClick={() => setAbierto(true)}><Receipt className="size-4" /> Radicar</Button>
      ) : (
        <Button size="sm" onClick={() => setAbierto(true)}><Plus className="size-4" /> Radicar cuenta</Button>
      )}
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Receipt className="size-4" /> Radicar cuenta de cobro</DialogTitle>
            <DialogDescription>
              La empresa la radica a nombre del colaborador o contratista; recibe la notificación para revisarla.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Colaborador / contratista <span className="text-destructive">*</span></Label>
              {inicial
                ? <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm font-medium">{inicial.nombre}</p>
                : <SelectorColaborador value={colaboradorId} onChange={setColaboradorId} />}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Periodo <span className="text-destructive">*</span></Label>
                <Input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Valor <span className="text-destructive">*</span></Label>
                <Input type="number" step="1" min="1" value={valor} onChange={(e) => setValor(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Concepto</Label>
              <Textarea rows={2} value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Honorarios del mes, comisiones, saldo a favor…" />
            </div>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
              <Switch checked={pedirPila} onCheckedChange={setPedirPila} className="mt-0.5" />
              <span className="min-w-0 text-sm">
                <span className="block font-medium">Pedir planilla PILA</span>
                <span className="block text-xs text-muted-foreground">Solo contratistas OPS: la adjunta desde su autoservicio y la cuenta se aprueba cuando esté verificada.</span>
              </span>
            </label>
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
