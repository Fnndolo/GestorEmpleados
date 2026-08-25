'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Gavel, Lock, CalendarX, ArrowUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { registrarDecisionDisciplinario, cerrarDisciplinario, vincularActaDisciplinario, registrarVencimientoDescargos, escalarAProcesoDisciplinario } from '../../acciones'
import { subirArchivoEntidad, ZonaArchivos } from '../../_ui'

export function AccionesDisciplinario({ procesoId, etapa, clase, plazoVencido, fechaLimite }: {
  procesoId: string
  etapa: string
  /** LLAMADO_ATENCION se detiene tras los descargos; PROCESO sigue hasta el acta. */
  clase: string
  /** El plazo de descargos ya pasó y el colaborador no respondió. */
  plazoVencido: boolean
  fechaLimite: string | null
}) {
  const router = useRouter()
  const [decision, setDecision] = useState('')
  const [archivos, setArchivos] = useState<File[]>([])
  const [g, setG] = useState(false)
  const [cerrar, setCerrar] = useState(false)
  const [escalar, setEscalar] = useState(false)
  const esLlamado = clase === 'LLAMADO_ATENCION'

  async function constanciaVencimiento() {
    setG(true)
    const res = await registrarVencimientoDescargos({ procesoId })
    setG(false)
    if (res.ok) { toast.success('Constancia registrada. Ya puedes registrar la decisión.'); router.refresh() }
    else toast.error(res.error, { duration: 8000 })
  }

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
      {etapa === 'CITACION_DESCARGOS' && !plazoVencido && (
        <p className="text-sm text-muted-foreground">
          Esperando los descargos del colaborador{fechaLimite ? `, hasta el ${fechaLimite}` : ' (5 días hábiles)'}.
          Podrás registrar la decisión cuando los presente.
        </p>
      )}
      {/* Si guarda silencio, el proceso no puede quedarse trabado: citado en
          debida forma y sin comparecer, se deja constancia y se continúa. */}
      {!esLlamado && etapa === 'CITACION_DESCARGOS' && plazoVencido && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Venció el plazo{fechaLimite ? ` el ${fechaLimite}` : ''} y el colaborador no presentó descargos.
            Deja la constancia para poder registrar la decisión; queda escrito en el expediente que
            no compareció, no que renunció a defenderse.
          </p>
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={constanciaVencimiento} disabled={g}>
              {g ? <Spinner /> : <CalendarX className="size-4" />} Dejar constancia y continuar
            </Button>
          </div>
        </div>
      )}
      {/* Un llamado se agota con la explicación del colaborador: no hay decisión
          que registrar. Lo que queda es cerrarlo o, si resultó más grave de lo
          que parecía, escalarlo sin perder lo ya actuado. */}
      {esLlamado && (etapa === 'DESCARGOS' || (etapa === 'CITACION_DESCARGOS' && plazoVencido)) && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {etapa === 'DESCARGOS'
              ? 'El colaborador ya se explicó. Un llamado de atención termina aquí: no lleva sanción ni plazo de apelación.'
              : 'Venció el plazo y el colaborador no respondió. Un llamado de atención termina aquí.'}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setEscalar(true)}>
              <ArrowUpRight className="size-4" /> Escalar a proceso disciplinario
            </Button>
            <Button size="sm" onClick={() => setCerrar(true)}>
              <Lock className="size-4" /> Cerrar llamado
            </Button>
          </div>
        </div>
      )}
      {!esLlamado && etapa === 'DESCARGOS' && (
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
      {escalar && <DialogEscalar procesoId={procesoId} onClose={() => setEscalar(false)} onDone={() => { setEscalar(false); router.refresh() }} />}
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

/**
 * Convierte el llamado en proceso disciplinario, conservando el expediente.
 *
 * Se pide el motivo porque es lo que va a leer quien revise por qué una medida
 * correctiva terminó siendo sancionatoria; sin eso, el salto queda sin explicar.
 */
function DialogEscalar({ procesoId, onClose, onDone }: { procesoId: string; onClose: () => void; onDone: () => void }) {
  const [motivo, setMotivo] = useState('')
  const [g, setG] = useState(false)

  async function confirmar() {
    if (motivo.trim().length < 5) { toast.error('Explica por qué se escala.'); return }
    setG(true)
    const res = await escalarAProcesoDisciplinario({ procesoId, motivo })
    setG(false)
    if (res.ok) { toast.success('Escalado a proceso disciplinario. Ya puedes registrar la decisión.'); onDone() }
    else toast.error(res.error, { duration: 8000 })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent>
      <DialogHeader><DialogTitle>Escalar a proceso disciplinario</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Se conserva el mismo expediente: la fecha de apertura, los soportes y los descargos que ya
          constan. A partir de aquí se habilitan la decisión, el recurso y el acta final.
        </p>
        <div className="space-y-1.5">
          <Label>¿Por qué se escala?</Label>
          <Textarea
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="La conducta se repitió, o los descargos revelaron una falta más grave…"
          />
          <p className="text-xs text-muted-foreground">
            Si se trata de hechos nuevos y distintos, abre otro proceso en vez de escalar este.
          </p>
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button onClick={confirmar} disabled={g}>{g && <Spinner />}Escalar</Button>
      </DialogFooter>
    </DialogContent></Dialog>
  )
}
