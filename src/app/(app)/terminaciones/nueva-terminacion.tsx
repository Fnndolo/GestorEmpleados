'use client'

import { useEffect, useState } from 'react'
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
import { crearTerminacion, listarProcesosCerrados } from './acciones'

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

/**
 * @param colaboradorInicial - llega desde el detalle del contrato, por el
 *   parámetro `?colaborador=` de la URL: abre el diálogo con esa persona ya
 *   elegida, para no obligar a buscarla de nuevo en la lista.
 */
export function NuevaTerminacion({ colaboradorInicial }: { colaboradorInicial?: string }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(Boolean(colaboradorInicial))
  const [colaboradorId, setColaboradorId] = useState(colaboradorInicial ?? '')
  const [tipo, setTipo] = useState('RENUNCIA_VOLUNTARIA')
  const [fechaRetiro, setFechaRetiro] = useState(new Date().toISOString().slice(0, 10))
  const [preavisoDias, setPreavisoDias] = useState('')
  const [motivo, setMotivo] = useState('')
  const [g, setG] = useState(false)
  // Justa causa: proceso disciplinario cerrado que la sustenta (debido proceso)
  const [procesos, setProcesos] = useState<{ id: string; asunto: string; fecha: string; decision: string | null }[] | null>(null)
  const [procesoId, setProcesoId] = useState('')

  async function cargarProcesos(colabId: string) {
    setProcesos(null); setProcesoId('')
    if (!colabId) return
    const res = await listarProcesosCerrados({ colaboradorId: colabId })
    if (res.ok) setProcesos((res.datos as { procesos: typeof procesos }).procesos ?? [])
  }

  // Al llegar con el colaborador ya puesto nadie disparó el selector, así que
  // sus procesos disciplinarios hay que cargarlos aquí o la justa causa no
  // tendría de dónde escoger.
  useEffect(() => {
    if (!colaboradorInicial) return
    let vigente = true
    void (async () => {
      const res = await listarProcesosCerrados({ colaboradorId: colaboradorInicial })
      if (vigente && res.ok) setProcesos((res.datos as { procesos: typeof procesos }).procesos ?? [])
    })()
    return () => { vigente = false }
    // Solo al montar: de ahí en adelante lo maneja el selector.
  }, [colaboradorInicial])

  async function crear() {
    if (!colaboradorId) { toast.error('Selecciona un colaborador.'); return }
    if (tipo === 'CON_JUSTA_CAUSA' && !procesoId) {
      toast.error('Selecciona el proceso disciplinario cerrado que sustenta la justa causa (debido proceso).')
      return
    }
    setG(true)
    const res = await crearTerminacion({
      colaboradorId, tipo: tipo as 'RENUNCIA_VOLUNTARIA', fechaRetiro,
      preavisoDias: preavisoDias ? Number(preavisoDias) : undefined, motivo,
      procesoDisciplinarioId: tipo === 'CON_JUSTA_CAUSA' ? procesoId : undefined,
    })
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
            <div className="space-y-1.5"><Label>Colaborador</Label><SelectorColaborador value={colaboradorId} onChange={(id) => { setColaboradorId(id); cargarProcesos(id) }} /></div>
            <div className="space-y-1.5">
              <Label>Tipo de terminación</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{TIPOS.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {tipo === 'CON_JUSTA_CAUSA' && (
              <div className="space-y-1.5 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                <Label>Proceso disciplinario que la sustenta (debido proceso)</Label>
                {!colaboradorId ? (
                  <p className="text-xs text-muted-foreground">Selecciona primero el colaborador.</p>
                ) : procesos === null ? (
                  <p className="text-xs text-muted-foreground">Cargando procesos…</p>
                ) : procesos.length === 0 ? (
                  <p className="text-xs text-destructive">
                    Este colaborador no tiene procesos disciplinarios cerrados. Sin debido proceso, la justa causa es demandable: adelanta primero el proceso en Jurídica → Disciplinarios.
                  </p>
                ) : (
                  <Select value={procesoId} onValueChange={setProcesoId}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Selecciona el proceso cerrado…" /></SelectTrigger>
                    <SelectContent>
                      {procesos.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.asunto} · {p.fecha}{p.decision ? ` · ${p.decision.slice(0, 40)}` : ''}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
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
