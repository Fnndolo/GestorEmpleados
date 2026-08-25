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
import { crearProcesoDisciplinario } from '@/app/(app)/juridica/acciones'
import { ZonaArchivos, subirArchivoEntidad } from '@/app/(app)/juridica/_ui'

/**
 * Asuntos que se repiten, para no escribirlos cada vez. Es una lista de
 * SUGERENCIAS, no un catálogo cerrado: el campo sigue siendo de texto libre
 * porque cada caso tiene sus matices y encerrarlos en cinco opciones obliga a
 * elegir la menos mala.
 *
 * «Llamado de atención» está entre ellas: una amonestación también se tramita
 * como proceso, y lo que la distingue de una sanción mayor es cómo termina, no
 * cómo se abre.
 */
const ASUNTOS_FRECUENTES = [
  'Llamado de atención',
  'Incumplimiento de horario',
  'Ausencia injustificada',
  'Incumplimiento de funciones del cargo',
  'Incumplimiento de normas de seguridad (SST)',
  'Uso indebido de bienes de la empresa',
  'Trato irrespetuoso a compañeros o clientes',
]

/**
 * Abre un proceso disciplinario desde la ficha del colaborador.
 *
 * Un solo camino: todo arranca como proceso, y lo que distingue una
 * amonestación de una sanción mayor es en qué termina —qué se decide en el acta
 * final—, no por dónde se empezó. Así el colaborador siempre conserva su
 * derecho a descargos, que es lo que sostiene la medida si después se discute.
 */
export function BotonDisciplinario({ colaboradorId, nombre, esOps }: { colaboradorId: string; nombre: string; esOps: boolean }) {
  const router = useRouter()
  const listaId = useId()
  const [abierto, setAbierto] = useState(false)
  const [asunto, setAsunto] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [archivos, setArchivos] = useState<File[]>([])
  const [g, setG] = useState(false)

  function abrir() {
    setAsunto(''); setDescripcion(''); setArchivos([])
    setFecha(new Date().toISOString().slice(0, 10))
    setAbierto(true)
  }

  async function guardar() {
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

  return (
    <>
      <Button size="sm" variant="outline" onClick={abrir}><Gavel className="size-4" /> Disciplinario</Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abrir proceso disciplinario</DialogTitle>
            <DialogDescription>
              Contra <b>{nombre}</b>. Se le notificará para presentar descargos (5 días hábiles).
            </DialogDescription>
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
            <Button onClick={guardar} disabled={g}>{g && <Spinner />}Abrir proceso</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
