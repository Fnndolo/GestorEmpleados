'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Clock, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Pill } from '@/components/ui-kit'
import { EditorDias } from '@/components/horarios/editor-dias'
import { horasSemana, jornadaMaximaSemanal, resumenHorario, textoHoras, type DiasHorario } from '@/lib/horarios'
import { cn } from '@/lib/utils'
import { activarHorario, eliminarHorario, guardarHorario } from './acciones'

type Plantilla = { id: string; nombre: string; descripcion: string | null; activo: boolean; dias: DiasHorario; personas: number; usado: boolean }

/** Las plantillas de horario: crear, editar (y aplicar a quienes la tienen), desactivar o borrar. */
export function PlantillasCliente({ plantillas, puedeEditar, hoy, abrirNueva = false }: { plantillas: Plantilla[]; puedeEditar: boolean; hoy: string; abrirNueva?: boolean }) {
  const router = useRouter()
  // El + del encabezado llega como ?nuevo=1: abre el editor vacío.
  const [editando, setEditando] = useState<Plantilla | 'nueva' | null>(abrirNueva ? 'nueva' : null)
  const cerrar = () => { setEditando(null); if (abrirNueva) router.replace('/horarios?ver=plantillas', { scroll: false }) }
  const maxima = jornadaMaximaSemanal(new Date())

  async function activar(p: Plantilla, activo: boolean) {
    const res = await activarHorario({ id: p.id, activo })
    if (res.ok) { toast.success(activo ? 'Horario activado.' : 'Horario desactivado: ya no se puede asignar.'); router.refresh() } else toast.error(res.error)
  }
  async function borrar(p: Plantilla) {
    const res = await eliminarHorario({ id: p.id })
    if (res.ok) { toast.success('Horario eliminado.'); router.refresh() } else toast.error(res.error)
  }

  return (
    <div className="space-y-3">
      {plantillas.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
          <Clock className="size-8" />
          <p>Aún no hay horarios. Crea uno, o recupéralos de AsistencIA desde la pestaña Personas.</p>
        </CardContent></Card>
      ) : (
        <Card className="py-0"><CardContent className="divide-y p-0">
          {plantillas.map((p) => {
            const horas = horasSemana(p.dias)
            return (
              <div key={p.id} className={cn('flex items-center gap-3 px-3 py-2.5', !p.activo && 'opacity-60')}>
                <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-foreground text-background max-sm:hidden"><Clock className="size-[18px]" /></span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium"><span className="truncate">{p.nombre}</span>{!p.activo && <Pill tone="muted">Desactivado</Pill>}</p>
                  <p className="truncate text-xs text-muted-foreground">{resumenHorario(p.dias)}</p>
                  {/* En el celular las horas y las personas van aquí, para que los botones quepan al lado. */}
                  <p className="text-xs text-muted-foreground sm:hidden">
                    <span className={cn('tabular-nums', horas > maxima && 'text-amber-700 dark:text-amber-400')}>{textoHoras(horas)}/sem</span> · {p.personas} persona{p.personas === 1 ? '' : 's'}
                  </p>
                </div>
                <span className={cn('text-sm tabular-nums max-sm:hidden', horas > maxima ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')} title={horas > maxima ? `Pasa de la jornada máxima (${maxima} h)` : undefined}>
                  {textoHoras(horas)}/sem
                </span>
                <span className="w-24 text-right text-xs text-muted-foreground max-sm:hidden">{p.personas} persona{p.personas === 1 ? '' : 's'}</span>
                {puedeEditar && (
                  <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
                    <Switch checked={p.activo} onCheckedChange={(v) => activar(p, v)} aria-label={p.activo ? 'Desactivar' : 'Activar'} title={p.activo ? 'Desactivar' : 'Activar'} />
                    <Button size="icon" variant="ghost" onClick={() => setEditando(p)} aria-label={`Editar ${p.nombre}`} title="Editar"><Pencil className="size-4" /></Button>
                    {!p.usado ? (
                      <Button size="icon" variant="ghost" onClick={() => borrar(p)} aria-label={`Eliminar ${p.nombre}`} title="Eliminar: nadie lo ha tenido"><Trash2 className="size-4 text-destructive" /></Button>
                    ) : (
                      // Deshabilitado pero visible: el título explica por qué y qué hacer en cambio.
                      <span title="Ya se le asignó a alguien y es parte de su historial: desactívalo en vez de borrarlo.">
                        <Button size="icon" variant="ghost" disabled aria-label={`${p.nombre} no se puede eliminar: ya se asignó`}><Trash2 className="size-4" /></Button>
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </CardContent></Card>
      )}

      {editando && (
        <EditorPlantilla
          plantilla={editando === 'nueva' ? null : editando}
          hoy={hoy}
          onClose={cerrar}
          onDone={() => { cerrar(); router.refresh() }}
        />
      )}
    </div>
  )
}

function EditorPlantilla({ plantilla, hoy, onClose, onDone }: { plantilla: Plantilla | null; hoy: string; onClose: () => void; onDone: () => void }) {
  const uid = useId()
  const [nombre, setNombre] = useState(plantilla?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(plantilla?.descripcion ?? '')
  const [dias, setDias] = useState<{ dias: Record<string, unknown>; error: string | null }>({ dias: (plantilla?.dias ?? {}) as Record<string, unknown>, error: plantilla ? null : 'Marca al menos un día de trabajo.' })
  const [aplicar, setAplicar] = useState(false)
  const [desde, setDesde] = useState(hoy)
  const [comunicar, setComunicar] = useState(true)
  const [g, setG] = useState(false)

  async function guardar() {
    setG(true)
    const res = await guardarHorario({
      id: plantilla?.id, nombre, descripcion: descripcion.trim() || undefined, dias: dias.dias,
      aplicar: plantilla && aplicar ? { desde, enviarComunicacion: comunicar } : undefined,
    })
    setG(false)
    if (!res.ok) { toast.error(res.error); return }
    const r = res.datos
    toast.success(plantilla ? `Horario guardado.${r.aplicados ? ` Aplicado a ${r.aplicados} persona${r.aplicados === 1 ? '' : 's'}.` : ''}` : 'Horario creado.')
    if (r.sinAsistencia.length) toast.warning(`No se pudo actualizar en AsistencIA: ${r.sinAsistencia.join(', ')}.`, { duration: 10000 })
    onDone()
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !g) onClose() }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{plantilla ? 'Editar horario' : 'Nuevo horario'}</DialogTitle>
          <DialogDescription>Una plantilla que se le asigna a las personas. Cada una queda con su copia: si después cambias la plantilla, puedes aplicarles el cambio.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`nombre-${uid}`}>Nombre <span className="text-destructive">*</span></Label>
              <Input id={`nombre-${uid}`} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Tienda lunes a sábado" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`desc-${uid}`}>Descripción</Label>
              <Input id={`desc-${uid}`} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Para las sedes con atención los sábados" />
            </div>
          </div>
          <EditorDias inicial={plantilla?.dias ?? null} onChange={(d, error) => setDias({ dias: d, error })} />

          {plantilla && plantilla.personas > 0 && (
            <div className="space-y-3 rounded-lg border p-3">
              <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                <Checkbox checked={aplicar} onCheckedChange={(c) => setAplicar(c === true)} className="mt-0.5" />
                <span>
                  <span className="block font-medium">Aplicar el cambio a las {plantilla.personas} persona{plantilla.personas === 1 ? '' : 's'} que lo tienen</span>
                  <span className="block text-xs text-muted-foreground">Si no, siguen con el horario que tenían y la plantilla solo cambia para quien se la asignen después.</span>
                </span>
              </label>
              {aplicar && (
                <div className="grid gap-3 pl-6 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={`desde-${uid}`}>Desde <span className="text-destructive">*</span></Label>
                    <Input id={`desde-${uid}`} type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 self-end pb-2 text-sm">
                    <Checkbox checked={comunicar} onCheckedChange={(c) => setComunicar(c === true)} />
                    Enviarles la comunicación
                  </label>
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={g}>Cancelar</Button>
          <Button onClick={guardar} disabled={g || !!dias.error || nombre.trim().length < 2 || (aplicar && !desde)}>{g && <Spinner />} Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
