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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { crearCapacitacion } from './acciones'

export function CrearCapacitacion() {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [f, setF] = useState<Record<string, string>>({ tipo: 'FORMACION', fecha: new Date().toISOString().slice(0, 10) })
  const [g, setG] = useState(false)
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))

  async function crear() {
    setG(true)
    const res = await crearCapacitacion({ titulo: f.titulo ?? '', tipo: f.tipo as 'FORMACION', fecha: f.fecha, duracionHoras: f.duracionHoras ? Number(f.duracionHoras) : undefined, facilitador: f.facilitador, descripcion: f.descripcion })
    setG(false)
    if (res.ok) { toast.success('Capacitación creada.'); setAbierto(false); router.push(`/capacitaciones/${(res.datos as { id: string }).id}`) } else toast.error(res.error)
  }

  return (
    <>
      <Button size="sm" onClick={() => setAbierto(true)}><Plus className="size-4" /> Nueva capacitación</Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nueva capacitación</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Título</Label><Input onChange={(e) => set('titulo', e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Tipo</Label>
                <Select value={f.tipo} onValueChange={(v) => set('tipo', v)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="INDUCCION">Inducción</SelectItem><SelectItem value="REINDUCCION">Reinducción</SelectItem><SelectItem value="FORMACION">Formación</SelectItem><SelectItem value="SST">SST</SelectItem></SelectContent></Select>
              </div>
              <div className="space-y-1.5"><Label>Fecha</Label><Input type="date" value={f.fecha} onChange={(e) => set('fecha', e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Duración (horas)</Label><Input type="number" onChange={(e) => set('duracionHoras', e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Facilitador</Label><Input onChange={(e) => set('facilitador', e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label>Descripción</Label><Textarea rows={2} onChange={(e) => set('descripcion', e.target.value)} /></div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button><Button onClick={crear} disabled={g}>{g && <Spinner />}Crear</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
