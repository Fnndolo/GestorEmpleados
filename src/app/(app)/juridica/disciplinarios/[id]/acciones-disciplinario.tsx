'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Gavel, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { registrarDecisionDisciplinario, cerrarDisciplinario, vincularActaDisciplinario } from '../../acciones'
import { subirArchivoEntidad, ZonaArchivos } from '../../_ui'

export function AccionesDisciplinario({ procesoId, etapa }: { procesoId: string; etapa: string }) {
  const router = useRouter()
  const [decision, setDecision] = useState('')
  const [archivos, setArchivos] = useState<File[]>([])
  const [g, setG] = useState(false)
  const [cerrar, setCerrar] = useState(false)

  async function guardarDecision() {
    if (decision.trim().length < 5) { toast.error('Escribe la decisión.'); return }
    setG(true)
    try {
      const res = await registrarDecisionDisciplinario({ procesoId, decision })
      if (!res.ok) throw new Error(res.error)
      const etapaId = (res.datos as { etapaId: string }).etapaId
      for (const file of archivos) await subirArchivoEntidad('EtapaProceso', etapaId, file, file.name)
      toast.success('Decisión registrada. El colaborador puede apelar.'); setDecision(''); setArchivos([]); router.refresh()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo registrar.') } finally { setG(false) }
  }

  return (
    <Card><CardContent className="py-4 space-y-3">
      <h3 className="text-sm font-medium">Actuación (RR.HH.)</h3>
      {etapa === 'CITACION_DESCARGOS' && (
        <p className="text-sm text-muted-foreground">Esperando los descargos del colaborador (tiene 5 días hábiles). Podrás registrar la decisión cuando los presente.</p>
      )}
      {etapa === 'DESCARGOS' && (
        <div className="space-y-2">
          <Label>Decisión</Label>
          <Textarea rows={3} value={decision} onChange={(e) => setDecision(e.target.value)} placeholder="Resolución del caso tras revisar los descargos…" />
          <Label className="text-xs">Soportes de la decisión (opcional)</Label>
          <ZonaArchivos archivos={archivos} onChange={setArchivos} accept="image/*,application/pdf,video/*" />
          <div className="flex justify-end"><Button size="sm" onClick={guardarDecision} disabled={g}>{g ? <Spinner /> : <Gavel className="size-4" />} Registrar decisión</Button></div>
        </div>
      )}
      {etapa === 'DECISION' && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Decisión registrada. El colaborador puede apelar dentro de los 5 días hábiles. Si ya no apelará o venció el plazo, cierra el proceso.</p>
          <div className="flex justify-end"><Button size="sm" onClick={() => setCerrar(true)}><Lock className="size-4" /> Cerrar proceso</Button></div>
        </div>
      )}
      {etapa === 'RECURSO' && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">El colaborador presentó un recurso de apelación. Resuélvelo y cierra el proceso.</p>
          <div className="flex justify-end"><Button size="sm" onClick={() => setCerrar(true)}><Lock className="size-4" /> Resolver y cerrar</Button></div>
        </div>
      )}
      {cerrar && <DialogCerrar procesoId={procesoId} onClose={() => setCerrar(false)} onDone={() => { setCerrar(false); router.refresh() }} />}
    </CardContent></Card>
  )
}

function DialogCerrar({ procesoId, onClose, onDone }: { procesoId: string; onClose: () => void; onDone: () => void }) {
  const [detalle, setDetalle] = useState('')
  const [acta, setActa] = useState<File[]>([])
  const [g, setG] = useState(false)
  async function confirmar() {
    setG(true)
    try {
      if (acta[0]) {
        const docId = await subirArchivoEntidad('ProcesoDisciplinario', procesoId, acta[0], 'Acta / acuerdo final')
        const rv = await vincularActaDisciplinario({ procesoId, documentoId: docId })
        if (!rv.ok) throw new Error(rv.error)
      }
      const res = await cerrarDisciplinario({ procesoId, detalle: detalle || undefined })
      if (!res.ok) throw new Error(res.error)
      toast.success('Proceso cerrado.'); onDone()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo cerrar.') } finally { setG(false) }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent>
      <DialogHeader><DialogTitle>Cerrar proceso disciplinario</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5"><Label>Resolución / acuerdo final (opcional)</Label><Textarea rows={3} value={detalle} onChange={(e) => setDetalle(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Acta / acuerdo firmado (opcional)</Label><ZonaArchivos archivos={acta} onChange={setActa} multiple={false} accept="image/*,application/pdf" /></div>
      </div>
      <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={confirmar} disabled={g}>{g && <Spinner />}Cerrar proceso</Button></DialogFooter>
    </DialogContent></Dialog>
  )
}
