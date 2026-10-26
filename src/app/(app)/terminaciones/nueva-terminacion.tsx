'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SelectorColaborador } from '@/components/colaboradores/selector-colaborador'
import { crearTerminacion, editarTerminacion, listarProcesosCerrados } from './acciones'

/** Lo que se precarga al editar el registro de una terminación. */
export type TerminacionInicial = {
  id: string
  tipo: string
  /** yyyy-mm-dd */
  fechaRetiro: string
  preavisoDias: number | null
  motivo: string | null
  procesoDisciplinarioId: string | null
  /** Viene de una renuncia presentada en la app: el tipo no se cambia. */
  desdeRenuncia: boolean
  cerrada: boolean
}

const Obl = () => <span className="text-destructive"> *</span>

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
 * @param renuncia - llega de una renuncia presentada en la app (`?renuncia=`):
 *   el diálogo abre con la persona, el último día y el motivo que escribió.
 * @param inicial - el mismo diálogo, precargado, para corregir el registro de
 *   una terminación ya creada (tipo, fecha de retiro, preaviso, motivo). El
 *   botón pasa a ser un lápiz y `colaboradorInicial` debe traer a la persona.
 */
export function NuevaTerminacion({ colaboradorInicial, renuncia, inicial }: {
  colaboradorInicial?: string
  renuncia?: { id: string; colaboradorId: string; nombre: string; fechaRetiro: string; motivo: string } | null
  inicial?: TerminacionInicial
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(!inicial && Boolean(colaboradorInicial || renuncia))
  const [colaboradorId, setColaboradorId] = useState(renuncia?.colaboradorId ?? colaboradorInicial ?? '')
  const [tipo, setTipo] = useState(inicial?.tipo ?? 'RENUNCIA_VOLUNTARIA')
  const [fechaRetiro, setFechaRetiro] = useState(inicial?.fechaRetiro ?? renuncia?.fechaRetiro ?? new Date().toISOString().slice(0, 10))
  const [preavisoDias, setPreavisoDias] = useState(inicial?.preavisoDias != null ? String(inicial.preavisoDias) : '')
  const [motivo, setMotivo] = useState(inicial?.motivo ?? renuncia?.motivo ?? '')
  const [g, setG] = useState(false)
  // Justa causa: proceso disciplinario cerrado que la sustenta (debido proceso)
  const [procesos, setProcesos] = useState<{ id: string; asunto: string; fecha: string; decision: string | null }[] | null>(null)
  const [procesoId, setProcesoId] = useState(inicial?.procesoDisciplinarioId ?? '')

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
    if (!fechaRetiro) { toast.error('Indica la fecha de retiro.'); return }
    setG(true)
    if (inicial) {
      const res = await editarTerminacion({
        id: inicial.id, tipo: tipo as 'RENUNCIA_VOLUNTARIA', fechaRetiro,
        preavisoDias: preavisoDias ? Number(preavisoDias) : undefined, motivo,
        procesoDisciplinarioId: tipo === 'CON_JUSTA_CAUSA' ? procesoId : undefined,
      })
      setG(false)
      if (res.ok) {
        if (res.datos.rehacerLiquidacion) {
          toast.warning('Terminación actualizada. Cambió la fecha de retiro o el tipo: rehaz el cálculo de la liquidación en el paso «Liquidación».', { duration: 10000 })
        } else toast.success('Terminación actualizada.')
        setAbierto(false)
        router.refresh()
      } else toast.error(res.error, { duration: 8000 })
      return
    }
    const res = await crearTerminacion({
      colaboradorId, tipo: tipo as 'RENUNCIA_VOLUNTARIA', fechaRetiro,
      preavisoDias: preavisoDias ? Number(preavisoDias) : undefined, motivo,
      procesoDisciplinarioId: tipo === 'CON_JUSTA_CAUSA' ? procesoId : undefined,
      renunciaId: renuncia?.id,
    })
    setG(false)
    if (res.ok) {
      toast.success(res.datos.liquidacionPendiente
        ? 'Terminación registrada. Completa el salario y el auxilio para calcular la liquidación.'
        : 'Terminación registrada.')
      setAbierto(false)
      router.push(`/terminaciones/${res.datos.id}`)
    }
    else toast.error(res.error)
  }

  const bloqueoEdicion = inicial?.cerrada ? 'La terminación ya está cerrada: no se modifica. Si hay un error, corrígelo por nota contable.' : null

  return (
    <>
      {inicial ? (
        <Button
          size="icon" variant="outline" aria-label="Editar terminación" title={bloqueoEdicion ?? 'Editar terminación'}
          className={bloqueoEdicion ? 'opacity-60' : undefined}
          onClick={() => (bloqueoEdicion ? toast.error(bloqueoEdicion, { duration: 8000 }) : setAbierto(true))}
        >
          <Pencil className="size-4" />
        </Button>
      ) : (
        <Button size="sm" onClick={() => setAbierto(true)}><Plus className="size-4" /> Registrar terminación</Button>
      )}
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{inicial ? 'Editar terminación' : 'Registrar terminación'}</DialogTitle>
            <DialogDescription>
              {inicial
                ? 'Corrige el registro. Si cambias la fecha de retiro o el tipo, después rehaz el cálculo de la liquidación: sus cifras no se actualizan solas.'
                : 'Se generará el paz y salvo. La liquidación usará las nóminas anteriores; si faltan, podrás completar sus valores manualmente.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {renuncia ? (
              <p className="rounded-lg border bg-muted/50 p-3 text-sm">
                <span className="font-medium">{renuncia.nombre}</span> presentó su renuncia en la app. Al registrarla, su carta firmada queda en la terminación.
              </p>
            ) : !inicial && (
              <div className="space-y-1.5"><Label>Colaborador<Obl /></Label><SelectorColaborador value={colaboradorId} onChange={(id) => { setColaboradorId(id); cargarProcesos(id) }} /></div>
            )}
            <div className={renuncia ? 'hidden' : 'space-y-1.5'}>
              <Label>Tipo de terminación<Obl /></Label>
              <Select value={tipo} onValueChange={setTipo} disabled={inicial?.desdeRenuncia}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{TIPOS.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
              </Select>
              {inicial?.desdeRenuncia && <p className="text-xs text-muted-foreground">Viene de una renuncia presentada en la app: el tipo no se cambia.</p>}
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
              <div className="space-y-1.5"><Label>Fecha de retiro<Obl /></Label><Input type="date" value={fechaRetiro} onChange={(e) => setFechaRetiro(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Preaviso (días)</Label><Input type="number" min={0} value={preavisoDias} onChange={(e) => setPreavisoDias(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label>Motivo / observaciones</Label><Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button onClick={crear} disabled={g}>{g && <Spinner />}{inicial ? 'Guardar cambios' : 'Registrar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
