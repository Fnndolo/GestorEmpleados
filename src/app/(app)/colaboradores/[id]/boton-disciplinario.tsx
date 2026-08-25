'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Gavel, MessageSquareWarning, ChevronLeft, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { crearProcesoDisciplinario, crearLlamadoAtencion } from '@/app/(app)/juridica/acciones'
import { ZonaArchivos, subirArchivoEntidad } from '@/app/(app)/juridica/_ui'

/**
 * Asuntos que se repiten, para no escribirlos cada vez. Es una lista de
 * SUGERENCIAS, no un catálogo cerrado: el campo sigue siendo de texto libre
 * porque cada caso tiene sus matices y encerrarlos en cinco opciones obliga a
 * elegir la menos mala.
 */
const ASUNTOS_FRECUENTES = [
  'Incumplimiento de horario',
  'Ausencia injustificada',
  'Incumplimiento de funciones del cargo',
  'Incumplimiento de normas de seguridad (SST)',
  'Uso indebido de bienes de la empresa',
  'Trato irrespetuoso a compañeros o clientes',
]

type Paso = 'elegir' | 'llamado' | 'proceso'

/**
 * Registra una medida disciplinaria desde la ficha del colaborador.
 *
 * Hay que elegir cuál de las dos porque no son lo mismo, y el orden entre ellas
 * es el punto: el llamado de atención corrige y queda como antecedente; si la
 * conducta se repite, ese antecedente se escala a proceso disciplinario desde
 * el historial. Abrir un proceso completo por una falta menor deja procesos que
 * nadie cierra; poner un llamado por una falta grave desperdicia el debido
 * proceso que sostiene la sanción.
 */
export function BotonDisciplinario({ colaboradorId, nombre, esOps }: { colaboradorId: string; nombre: string; esOps: boolean }) {
  const router = useRouter()
  const listaId = useId()
  const [abierto, setAbierto] = useState(false)
  const [paso, setPaso] = useState<Paso>('elegir')
  const [asunto, setAsunto] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [tipoLlamado, setTipoLlamado] = useState<'VERBAL' | 'ESCRITO'>('ESCRITO')
  const [archivos, setArchivos] = useState<File[]>([])
  const [g, setG] = useState(false)

  function abrir() {
    setPaso('elegir')
    setAsunto(''); setDescripcion(''); setArchivos([])
    setFecha(new Date().toISOString().slice(0, 10))
    setTipoLlamado('ESCRITO')
    setAbierto(true)
  }

  async function guardarProceso() {
    if (asunto.trim().length < 3) { toast.error('Escribe el asunto.'); return }
    setG(true)
    try {
      const res = await crearProcesoDisciplinario({ colaboradorId, asunto, descripcion, fechaApertura: fecha })
      if (!res.ok) throw new Error(res.error)
      const { id, etapaId } = res.datos as { id: string; etapaId: string }
      for (const file of archivos) await subirArchivoEntidad('EtapaProceso', etapaId, file, file.name)
      toast.success('Proceso disciplinario abierto.')
      setAbierto(false)
      router.push(`/juridica/disciplinarios/${id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo abrir el proceso.')
    } finally {
      setG(false)
    }
  }

  async function guardarLlamado() {
    if (asunto.trim().length < 3) { toast.error('Escribe el motivo.'); return }
    setG(true)
    const res = await crearLlamadoAtencion({ colaboradorId, tipo: tipoLlamado, motivo: asunto, detalle: descripcion, fecha })
    setG(false)
    if (!res.ok) { toast.error(res.error, { duration: 8000 }); return }
    // Se queda en la ficha a propósito: el llamado no tiene trámite posterior, y
    // si más adelante hay que escalarlo se hace desde este mismo historial.
    toast.success('Llamado de atención registrado. Se le notificó al colaborador.')
    setAbierto(false)
    router.refresh()
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={abrir}><Gavel className="size-4" /> Disciplinario</Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          {paso === 'elegir' && (
            <>
              <DialogHeader>
                <DialogTitle>Medida disciplinaria</DialogTitle>
                <DialogDescription>Para <b>{nombre}</b>. ¿Qué vas a registrar?</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3">
                <button
                  type="button"
                  disabled={esOps}
                  onClick={() => setPaso('llamado')}
                  className="rounded-lg border p-3 text-left transition enabled:hover:border-primary enabled:hover:bg-accent disabled:opacity-60"
                >
                  <p className="flex items-center gap-2 font-medium">
                    <MessageSquareWarning className="size-4 text-muted-foreground" /> Llamado de atención
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {esOps
                      ? 'No disponible en prestación de servicios: llamarle la atención a un contratista es un indicio de subordinación y sirve de prueba en un pleito por contrato realidad. Los incumplimientos se manejan por las cláusulas del contrato.'
                      : 'Medida correctiva, no una sanción. No abre descargos ni plazos: se registra, se le notifica y queda como antecedente. Si la conducta se repite, se escala a proceso desde el historial.'}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setPaso('proceso')}
                  className="rounded-lg border p-3 text-left transition hover:border-primary hover:bg-accent"
                >
                  <p className="flex items-center gap-2 font-medium">
                    <Gavel className="size-4 text-muted-foreground" /> Proceso disciplinario
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    El que puede terminar en sanción o sustentar un despido con justa causa. Cita a
                    descargos con 5 días hábiles y sigue las etapas hasta el acta final.
                  </p>
                </button>
              </div>
            </>
          )}

          {paso === 'llamado' && (
            <>
              <DialogHeader>
                <DialogTitle>Llamado de atención</DialogTitle>
                <DialogDescription>A <b>{nombre}</b>. Se le notificará; no tiene que presentar descargos.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Tipo</Label>
                  <Select value={tipoLlamado} onValueChange={(x) => setTipoLlamado(x as 'VERBAL' | 'ESCRITO')}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="VERBAL">Verbal</SelectItem>
                      <SelectItem value="ESCRITO">Escrito</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="motivo-ll">Motivo</Label>
                  <Input id="motivo-ll" list={listaId} value={asunto} onChange={(e) => setAsunto(e.target.value)} placeholder="Elige uno de la lista o escríbelo" autoComplete="off" />
                  <datalist id={listaId}>
                    {ASUNTOS_FRECUENTES.map((a) => <option key={a} value={a} />)}
                  </datalist>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="detalle-ll">Detalle (opcional)</Label>
                  <Textarea id="detalle-ll" rows={3} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fecha-ll">Fecha</Label>
                  <Input id="fecha-ll" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setPaso('elegir')}><ChevronLeft className="size-4" /> Atrás</Button>
                <Button onClick={guardarLlamado} disabled={g}>{g && <Spinner />}Registrar</Button>
              </DialogFooter>
            </>
          )}

          {paso === 'proceso' && (
            <>
              <DialogHeader>
                <DialogTitle>Abrir proceso disciplinario</DialogTitle>
                <DialogDescription>Contra <b>{nombre}</b>. Se le notificará para presentar descargos (5 días hábiles).</DialogDescription>
              </DialogHeader>

              {/* El poder disciplinario sobre un contratista es el indicio más fuerte
                  de subordinación: se avisa, pero la decisión queda en quien registra. */}
              {esOps && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-300">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                  <p>
                    Su vínculo es de prestación de servicios. Abrirle un proceso disciplinario a un
                    contratista es un indicio de subordinación y sirve de prueba en un pleito por
                    contrato realidad; los incumplimientos se manejan por las cláusulas del contrato.
                  </p>
                </div>
              )}

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="asunto-disc">Asunto</Label>
                  <Input id="asunto-disc" list={listaId} value={asunto} onChange={(e) => setAsunto(e.target.value)} placeholder="Elige uno de la lista o escríbelo" autoComplete="off" />
                  <datalist id={listaId}>
                    {ASUNTOS_FRECUENTES.map((a) => <option key={a} value={a} />)}
                  </datalist>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="desc-disc">Descripción</Label>
                  <Textarea id="desc-disc" rows={3} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fecha-disc">Fecha de apertura</Label>
                  <Input id="fecha-disc" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Soportes de prueba (opcional — imágenes, PDF, video)</Label>
                  <ZonaArchivos archivos={archivos} onChange={setArchivos} accept="image/*,application/pdf,video/*" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setPaso('elegir')}><ChevronLeft className="size-4" /> Atrás</Button>
                <Button onClick={guardarProceso} disabled={g}>{g && <Spinner />}Abrir proceso</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
