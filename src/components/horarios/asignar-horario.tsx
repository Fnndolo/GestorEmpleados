'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Clock, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { asignarHorarioColaborador, previsualizarCambioHorario } from '@/app/(app)/horarios/acciones'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { horasSemana, resumenHorario, textoHoras, type DiasHorario } from '@/lib/horarios'
import { EditorDias } from './editor-dias'
import { TablaHorario } from './tabla-horario'

export type PlantillaHorario = { id: string; nombre: string; dias: DiasHorario }

const PROPIO = 'propio'

/**
 * Asignar o cambiar el horario de una persona: una plantilla o uno propio,
 * desde una fecha, con motivo y la comunicación del cambio (opcional). Si
 * AsistencIA está conectada, allá se actualiza el día que empieza.
 */
export function AsignarHorario({ colaboradorId, nombre, plantillas, actual, hoy, conAsistencia, etiqueta = 'Cambiar horario', variante = 'default', compacto = false }: {
  colaboradorId: string
  nombre: string
  plantillas: PlantillaHorario[]
  /** Lo que tiene hoy (para partir de ahí en un horario propio). */
  actual: { horarioId: string | null; dias: DiasHorario } | null
  /** AAAA-MM-DD */
  hoy: string
  conAsistencia: boolean
  etiqueta?: string
  variante?: 'default' | 'outline' | 'ghost'
  /** En el celular, el botón queda solo con el ícono. */
  compacto?: boolean
}) {
  const router = useRouter()
  const uid = useId()
  const [abierto, setAbierto] = useState(false)
  const [eleccion, setEleccion] = useState(actual?.horarioId && plantillas.some((p) => p.id === actual.horarioId) ? actual.horarioId : actual ? PROPIO : plantillas[0]?.id ?? PROPIO)
  // El horario propio parte del que tiene hoy o, si no tiene, de la plantilla que estaba a la vista.
  const [propio, setPropio] = useState<{ dias: Record<string, unknown>; error: string | null } | null>(actual ? { dias: actual.dias as Record<string, unknown>, error: null } : null)
  const [desde, setDesde] = useState(hoy)
  const [motivo, setMotivo] = useState('')
  const [comunicar, setComunicar] = useState(true)
  const [g, setG] = useState(false)
  const [previa, setPrevia] = useState<Blob | null>(null)
  const [generando, setGenerando] = useState(false)

  const plantilla = plantillas.find((p) => p.id === eleccion)
  const invalido = !desde || (eleccion === PROPIO && (!propio || !!propio.error)) || (eleccion !== PROPIO && !plantilla)

  function elegir(v: string) {
    if (v === PROPIO && !propio && plantilla) setPropio({ dias: plantilla.dias as Record<string, unknown>, error: null })
    setEleccion(v)
  }

  // La comunicación tal como le llegaría, antes de asignar: no es obligatorio verla.
  async function verComunicacion() {
    setGenerando(true)
    const res = await previsualizarCambioHorario({
      colaboradorId, horarioId: eleccion === PROPIO ? '' : eleccion, dias: eleccion === PROPIO ? propio?.dias : undefined,
      desde, motivo: motivo.trim() || undefined,
    })
    setGenerando(false)
    if (!res.ok) { toast.error(res.error); return }
    setPrevia(new Blob([Uint8Array.from(atob(res.datos.pdf), (ch) => ch.charCodeAt(0))], { type: 'application/pdf' }))
  }

  async function guardar() {
    setG(true)
    const res = await asignarHorarioColaborador({
      colaboradorId, horarioId: eleccion === PROPIO ? '' : eleccion, dias: eleccion === PROPIO ? propio?.dias : undefined,
      desde, motivo: motivo.trim() || undefined, enviarComunicacion: comunicar,
    })
    setG(false)
    if (!res.ok) { toast.error(res.error); return }
    const r = res.datos
    const partes = [desde > hoy ? `Horario programado desde el ${desde.split('-').reverse().join('/')}.` : 'Horario asignado.']
    if (r.documentoId) partes.push('Le enviamos la comunicación.')
    if (r.asistencia === 'enviado') partes.push('Quedó también en AsistencIA.')
    else if (r.asistencia === 'programado' && conAsistencia) partes.push('Llega a AsistencIA el día que empieza.')
    if (r.asistencia === 'error') toast.warning(`${partes.join(' ')} Pero no se pudo actualizar en AsistencIA: ${r.errorAsistencia}`, { duration: 10000 })
    else toast.success(partes.join(' '))
    setAbierto(false)
    router.refresh()
  }

  return (
    <>
      <Button size="sm" variant={variante} onClick={() => setAbierto(true)} aria-label={`${etiqueta} · ${nombre}`} title={etiqueta} className={compacto ? 'max-sm:size-8 max-sm:px-0' : undefined}>
        <Clock className="size-4" /> <span className={compacto ? 'max-sm:sr-only' : undefined}>{etiqueta}</span>
      </Button>
      <Dialog open={abierto} onOpenChange={(o) => { if (!g) setAbierto(o) }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{etiqueta}</DialogTitle>
            <DialogDescription>{nombre}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={`horario-${uid}`}>Horario <span className="text-destructive">*</span></Label>
              <Select value={eleccion} onValueChange={elegir}>
                <SelectTrigger id={`horario-${uid}`} className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {plantillas.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nombre} · {textoHoras(horasSemana(p.dias))}</SelectItem>
                  ))}
                  <SelectItem value={PROPIO}>Horario propio (solo para esta persona)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {eleccion === PROPIO ? (
              // Parte de lo último que tenía el editor: al volver de ver una plantilla no se pierde lo que se cambió.
              <EditorDias inicial={(propio?.dias ?? null) as DiasHorario | null} onChange={(dias, error) => setPropio({ dias, error })} />
            ) : plantilla ? (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">{resumenHorario(plantilla.dias)} · {textoHoras(horasSemana(plantilla.dias))} a la semana</p>
                <TablaHorario dias={plantilla.dias} />
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`desde-${uid}`}>Desde <span className="text-destructive">*</span></Label>
                <Input id={`desde-${uid}`} type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor={`motivo-${uid}`}>Motivo del cambio</Label>
                <Textarea id={`motivo-${uid}`} rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Apertura de la tienda los domingos, cambio de sede…" />
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-lg border p-3 text-sm">
              <label className="flex flex-1 cursor-pointer items-start gap-2.5">
                <Checkbox checked={comunicar} onCheckedChange={(c) => setComunicar(c === true)} className="mt-0.5" />
                <span>
                  <span className="block font-medium">Enviarle la comunicación del cambio</span>
                  <span className="block text-xs text-muted-foreground">Un PDF con su horario nuevo, que le llega con un aviso y le queda en sus documentos.</span>
                </span>
              </label>
              <Button type="button" size="icon" variant="ghost" onClick={verComunicacion} disabled={generando || invalido} aria-label="Ver cómo queda la comunicación" title="Ver cómo queda la comunicación">
                {generando ? <Spinner /> : <Eye className="size-4" />}
              </Button>
            </div>
            {conAsistencia && (
              <p className="text-xs text-muted-foreground">También se actualiza en AsistencIA{desde > hoy ? ' el día que empieza' : ''}, que calcula las horas extra con este horario.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAbierto(false)} disabled={g}>Cancelar</Button>
            <Button onClick={guardar} disabled={g || invalido}>{g && <Spinner />} Asignar horario</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {previa && (
        <VisorPdf archivo={previa} titulo={`Comunicación del cambio · ${nombre}`} abierto onAbiertoChange={(v) => { if (!v) setPrevia(null) }} />
      )}
    </>
  )
}
