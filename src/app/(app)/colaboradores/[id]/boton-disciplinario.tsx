'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Gavel, MessageSquareWarning, ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { crearProcesoDisciplinario, crearLlamadoAtencion } from '@/app/(app)/juridica/acciones'
import { ZonaArchivos, subirArchivoEntidad } from '@/app/(app)/juridica/_ui'

type Paso = 'elegir' | 'llamado' | 'proceso'

/**
 * Registra una medida disciplinaria desde la ficha del colaborador.
 *
 * Primero hay que elegir cuál de las dos, porque no son lo mismo: el llamado de
 * atención es correctivo y solo queda como antecedente, mientras que el proceso
 * disciplinario es el que puede terminar en sanción y por eso exige descargos y
 * plazos. Tramitar una amonestación menor por el camino largo deja procesos
 * abiertos que nadie cierra y ensucia el historial de la persona.
 */
export function BotonDisciplinario({ colaboradorId, nombre, esOps }: { colaboradorId: string; nombre: string; esOps: boolean }) {
  const router = useRouter()
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
      toast.success('Proceso disciplinario abierto.'); setAbierto(false); router.push(`/juridica/disciplinarios/${id}`)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo abrir el proceso.') } finally { setG(false) }
  }

  async function guardarLlamado() {
    if (asunto.trim().length < 3) { toast.error('Escribe el motivo.'); return }
    setG(true)
    const res = await crearLlamadoAtencion({ colaboradorId, tipo: tipoLlamado, motivo: asunto, detalle: descripcion, fecha })
    setG(false)
    if (!res.ok) { toast.error(res.error); return }
    // Se queda en la ficha a propósito: el llamado no tiene trámite posterior,
    // así que mandarlo a otra pantalla solo estorbaría.
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
                      : 'Medida correctiva, no una sanción. No abre descargos ni plazos: se registra, se le notifica y queda como antecedente para demostrar que la falta fue reiterada.'}
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
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="VERBAL">Verbal</SelectItem>
                      <SelectItem value="ESCRITO">Escrito</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Motivo</Label><Input value={asunto} onChange={(e) => setAsunto(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Detalle (opcional)</Label><Textarea rows={3} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Fecha</Label><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
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
              <div className="space-y-4">
                <div className="space-y-1.5"><Label>Asunto</Label><Input value={asunto} onChange={(e) => setAsunto(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Descripción</Label><Textarea rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Fecha de apertura</Label><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Soportes de prueba (opcional — imágenes, PDF, video)</Label><ZonaArchivos archivos={archivos} onChange={setArchivos} accept="image/*,application/pdf,video/*" /></div>
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
