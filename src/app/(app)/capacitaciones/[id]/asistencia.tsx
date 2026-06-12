'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SelectorColaborador } from '@/components/colaboradores/selector-colaborador'
import { registrarAsistencia } from '../acciones'

type Asistente = { id: string; colaborador: string; evaluacion: number | null }

export function Asistencia({ capacitacionId, asistentes, puedeEditar }: { capacitacionId: string; asistentes: Asistente[]; puedeEditar: boolean }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [colaboradorId, setColaboradorId] = useState('')
  const [evaluacion, setEvaluacion] = useState('')
  const [g, setG] = useState(false)

  async function agregar() {
    if (!colaboradorId) { toast.error('Selecciona un colaborador.'); return }
    setG(true)
    const res = await registrarAsistencia({ capacitacionId, colaboradorId, evaluacion: evaluacion ? Number(evaluacion) : undefined })
    setG(false)
    if (res.ok) { toast.success('Asistencia registrada.'); setAbierto(false); setColaboradorId(''); setEvaluacion(''); router.refresh() } else toast.error(res.error)
  }

  return (
    <div className="space-y-3">
      {puedeEditar && <div className="flex justify-end"><Button size="sm" onClick={() => setAbierto(true)}><UserPlus className="size-4" /> Registrar asistencia</Button></div>}
      {asistentes.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Aún no hay asistentes.</CardContent></Card>
      ) : (
        <Card><CardContent className="p-0 divide-y">
          {asistentes.map((a) => (
            <div key={a.id} className="flex items-center justify-between p-3">
              <p className="text-sm">{a.colaborador}</p>
              {a.evaluacion != null && <span className="text-sm text-muted-foreground">Evaluación: {a.evaluacion}</span>}
            </div>
          ))}
        </CardContent></Card>
      )}
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar asistencia</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Colaborador</Label><SelectorColaborador value={colaboradorId} onChange={(id) => setColaboradorId(id)} /></div>
            <div className="space-y-1.5"><Label>Evaluación (0-100, opcional)</Label><Input type="number" value={evaluacion} onChange={(e) => setEvaluacion(e.target.value)} /></div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button><Button onClick={agregar} disabled={g}>{g && <Spinner />}Registrar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
