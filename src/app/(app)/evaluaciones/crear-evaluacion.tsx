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
import { crearEvaluacion } from './acciones'

export function CrearEvaluacion() {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [colaboradorId, setColaboradorId] = useState('')
  const [f, setF] = useState<Record<string, string>>({ periodo: `${new Date().getUTCFullYear()}-S1`, fecha: new Date().toISOString().slice(0, 10) })
  const [g, setG] = useState(false)
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))

  async function crear() {
    if (!colaboradorId) { toast.error('Selecciona un colaborador.'); return }
    setG(true)
    const res = await crearEvaluacion({ colaboradorId, periodo: f.periodo, puntaje: Number(f.puntaje || 0), fecha: f.fecha, fortalezas: f.fortalezas, oportunidades: f.oportunidades, compromisos: f.compromisos })
    setG(false)
    if (res.ok) { toast.success('Evaluación registrada.'); setAbierto(false); router.refresh() } else toast.error(res.error)
  }

  return (
    <>
      <Button size="sm" onClick={() => setAbierto(true)}><Plus className="size-4" /> Nueva evaluación</Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nueva evaluación de desempeño</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Colaborador</Label><SelectorColaborador value={colaboradorId} onChange={(id) => setColaboradorId(id)} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>Periodo</Label><Input value={f.periodo} onChange={(e) => set('periodo', e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Puntaje</Label><Input type="number" onChange={(e) => set('puntaje', e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Fecha</Label><Input type="date" value={f.fecha} onChange={(e) => set('fecha', e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label>Fortalezas</Label><Textarea rows={2} onChange={(e) => set('fortalezas', e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Oportunidades de mejora</Label><Textarea rows={2} onChange={(e) => set('oportunidades', e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Compromisos</Label><Textarea rows={2} onChange={(e) => set('compromisos', e.target.value)} /></div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button><Button onClick={crear} disabled={g}>{g && <Spinner />}Registrar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
