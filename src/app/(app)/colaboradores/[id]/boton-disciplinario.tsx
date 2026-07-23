'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Gavel } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { crearProcesoDisciplinario } from '@/app/(app)/juridica/acciones'
import { ZonaArchivos, subirArchivoEntidad } from '@/app/(app)/juridica/_ui'

/** Abre un proceso disciplinario ya asociado a este colaborador (desde su ficha). */
export function BotonDisciplinario({ colaboradorId, nombre }: { colaboradorId: string; nombre: string }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [asunto, setAsunto] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [archivos, setArchivos] = useState<File[]>([])
  const [g, setG] = useState(false)

  async function guardar() {
    if (asunto.trim().length < 3) { toast.error('Escribe el asunto.'); return }
    setG(true)
    try {
      const res = await crearProcesoDisciplinario({ colaboradorId, asunto, descripcion, fechaApertura: fecha })
      if (!res.ok) throw new Error(res.error)
      const { id, etapaId } = res.datos as { id: string; etapaId: string }
      for (const file of archivos) await subirArchivoEntidad('EtapaProceso', etapaId, file, file.name)
      toast.success('Proceso disciplinario abierto.'); setAbierto(false); router.push(`/juridica/disciplinarios/${id}`)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo abrir el proceso.') } finally { setG(false) }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setAbierto(true)}><Gavel className="size-4" /> Disciplinario</Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abrir proceso disciplinario</DialogTitle>
            <DialogDescription>Contra <b>{nombre}</b>. Se le notificará para presentar descargos (5 días hábiles).</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Asunto</Label><Input value={asunto} onChange={(e) => setAsunto(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Descripción</Label><Textarea rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Fecha de apertura</Label><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Soportes de prueba (opcional — imágenes, PDF, video)</Label><ZonaArchivos archivos={archivos} onChange={setArchivos} accept="image/*,application/pdf,video/*" /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button onClick={guardar} disabled={g}>{g && <Spinner />}Abrir proceso</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
