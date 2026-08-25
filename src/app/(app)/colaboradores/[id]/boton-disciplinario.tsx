'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Gavel, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { crearProcesoDisciplinario } from '@/app/(app)/juridica/acciones'
import { ZonaArchivos, subirArchivoEntidad } from '@/app/(app)/juridica/_ui'

/**
 * Asuntos que se repiten, para no escribirlos cada vez. Es una lista de
 * SUGERENCIAS, no un catálogo cerrado: el campo sigue siendo de texto libre
 * porque cada caso tiene sus matices y encerrarlos en seis opciones obliga a
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

/**
 * Registra una medida disciplinaria desde la ficha del colaborador.
 *
 * Las dos comparten expediente y arrancan igual —se notifica y se dan 5 días
 * hábiles para explicarse, porque el art. 115 del CST no distingue—, pero el
 * llamado se detiene ahí y el proceso sigue hasta la decisión y el acta. Así una
 * amonestación menor no arrastra un plazo de apelación que nadie va a usar, y si
 * después resulta más grave de lo que parecía, se escala sin perder lo actuado.
 */
export function BotonDisciplinario({ colaboradorId, nombre, esOps }: { colaboradorId: string; nombre: string; esOps: boolean }) {
  const router = useRouter()
  const listaId = useId()
  const [abierto, setAbierto] = useState(false)
  const [asunto, setAsunto] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [clase, setClase] = useState<'LLAMADO_ATENCION' | 'PROCESO'>('LLAMADO_ATENCION')
  const [archivos, setArchivos] = useState<File[]>([])
  const [g, setG] = useState(false)
  const esLlamado = clase === 'LLAMADO_ATENCION'

  function abrir() {
    setAsunto(''); setDescripcion(''); setArchivos([]); setClase('LLAMADO_ATENCION')
    setFecha(new Date().toISOString().slice(0, 10))
    setAbierto(true)
  }

  async function guardar() {
    if (asunto.trim().length < 3) { toast.error('Escribe el asunto.'); return }
    setG(true)
    try {
      const res = await crearProcesoDisciplinario({ colaboradorId, clase, asunto, descripcion, fechaApertura: fecha })
      if (!res.ok) throw new Error(res.error)
      const { id, etapaId } = res.datos as { id: string; etapaId: string }
      for (const file of archivos) await subirArchivoEntidad('EtapaProceso', etapaId, file, file.name)
      toast.success(clase === 'LLAMADO_ATENCION' ? 'Llamado de atención registrado.' : 'Proceso disciplinario abierto.')
      setAbierto(false)
      router.push(`/juridica/disciplinarios/${id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo abrir el proceso.')
    } finally {
      setG(false)
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={abrir}><Gavel className="size-4" /> Disciplinario</Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{esLlamado ? 'Llamado de atención' : 'Abrir proceso disciplinario'}</DialogTitle>
            <DialogDescription>
              {esLlamado ? 'Para' : 'Contra'} <b>{nombre}</b>. Se le notificará y tendrá 5 días hábiles para
              {esLlamado ? ' explicar lo ocurrido.' : ' presentar sus descargos.'}
            </DialogDescription>
          </DialogHeader>

          {/* Los dos usan el mismo expediente; lo que cambia es hasta dónde
              llega. Se elige aquí y no por el texto del asunto, que es libre. */}
          <div className="grid gap-2 sm:grid-cols-2">
            {([
              ['LLAMADO_ATENCION', 'Llamado de atención', 'Corrige. Termina cuando el colaborador se explica; no lleva sanción ni apelación. Después se puede escalar.'],
              ['PROCESO', 'Proceso disciplinario', 'Puede terminar en sanción o sustentar un despido con justa causa. Sigue hasta la decisión, el recurso y el acta.'],
            ] as const).map(([valor, titulo, ayuda]) => (
              <button
                key={valor}
                type="button"
                onClick={() => setClase(valor)}
                className={cn(
                  'rounded-lg border p-2.5 text-left transition',
                  clase === valor ? 'border-primary bg-accent' : 'hover:border-foreground/20',
                )}
              >
                <p className="text-sm font-medium">{titulo}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{ayuda}</p>
              </button>
            ))}
          </div>

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
              {/* Campo de texto con sugerencias: se elige de la lista o se escribe
                  lo que sea. Un <select> cerrado obligaría a forzar el caso. */}
              <Input
                id="asunto-disc"
                list={listaId}
                value={asunto}
                onChange={(e) => setAsunto(e.target.value)}
                placeholder="Elige uno de la lista o escríbelo"
                autoComplete="off"
              />
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
            <Button variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button onClick={guardar} disabled={g}>{g && <Spinner />}{esLlamado ? 'Registrar llamado' : 'Abrir proceso'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
