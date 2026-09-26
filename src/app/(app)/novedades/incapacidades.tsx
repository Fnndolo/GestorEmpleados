'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Pencil, Trash2, Stethoscope, Paperclip } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SelectorColaborador } from '@/components/colaboradores/selector-colaborador'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { ArchivoInput } from '@/components/documentos/archivo-input'
import { ListaAcordeon } from '@/components/ui-kit/lista-acordeon'
import { Pill } from '@/components/ui-kit'
import { formatFechaCorta } from '@/lib/fechas'
import { registrarIncapacidad, editarIncapacidad, eliminarIncapacidad } from './acciones'

export const TIPO_INCAP: Record<string, string> = {
  ENFERMEDAD_GENERAL: 'Enfermedad general', ACCIDENTE_TRABAJO: 'Accidente de trabajo',
  ENFERMEDAD_LABORAL: 'Enfermedad laboral', LICENCIA_MATERNIDAD: 'Lic. maternidad', LICENCIA_PATERNIDAD: 'Lic. paternidad',
}

export type IncapacidadItem = {
  id: string; colaborador: string; colaboradorId: string; fotoUrl: string | null
  tipo: string; fechaInicio: string; fechaFin: string; dias: number
  entidad: string | null; diagnosticoCie10: string | null; esProrroga: boolean; observaciones: string | null
  desdeAutoservicio: boolean
  /** Soporte (solo llega si quien mira tiene permiso de datos de salud). */
  soporteDocId: string | null
  conSoporte: boolean
}

const fecha = (iso: string) => formatFechaCorta(new Date(`${iso}T12:00:00Z`))

/**
 * Incapacidades en Novedades: la lista, con su soporte (dato de salud: solo lo
 * abre quien tiene ese permiso), y para Talento Humano editar, adjuntar el
 * soporte y borrar las mal registradas.
 */
export function ListaIncapacidades({ items, puedeEditar, puedeEliminar }: { items: IncapacidadItem[]; puedeEditar: boolean; puedeEliminar: boolean }) {
  const [editando, setEditando] = useState<IncapacidadItem | null>(null)
  const [borrando, setBorrando] = useState<IncapacidadItem | null>(null)
  if (items.length === 0) return <p className="py-12 text-center text-sm text-muted-foreground">No hay registros.</p>

  return (
    <>
      <ListaAcordeon
        compactoEnMovil
        chip={{ icono: Stethoscope, color: 'rose' }}
        items={items.map((x) => ({
          id: x.id,
          titulo: x.colaborador,
          avatar: { colaboradorId: x.colaboradorId, fotoUrl: x.fotoUrl, nombre: x.colaborador },
          sub: `${TIPO_INCAP[x.tipo] ?? x.tipo} · ${fecha(x.fechaInicio)} a ${fecha(x.fechaFin)} · ${x.dias} días`,
          campos: [
            { label: 'Tipo', valor: TIPO_INCAP[x.tipo] ?? x.tipo },
            { label: 'Desde', valor: fecha(x.fechaInicio) },
            { label: 'Hasta', valor: fecha(x.fechaFin) },
            { label: 'Días', valor: String(x.dias) },
            ...(x.entidad ? [{ label: 'Entidad', valor: x.entidad }] : []),
            ...(x.diagnosticoCie10 ? [{ label: 'CIE-10', valor: x.diagnosticoCie10 }] : []),
            ...(x.esProrroga ? [{ label: 'Prórroga', valor: 'Sí' }] : []),
            ...(x.observaciones ? [{ label: 'Observaciones', valor: x.observaciones }] : []),
            { label: 'Origen', valor: x.desdeAutoservicio ? 'Autoservicio' : 'Registro de RRHH' },
          ],
          derecha: (
            <div className="flex flex-wrap items-center gap-2">
              {x.desdeAutoservicio && <Badge variant="outline" className="text-[10px]">Autoservicio</Badge>}
              {x.soporteDocId ? (
                <VisorPdf documentoId={x.soporteDocId} titulo="Soporte de incapacidad" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  <Paperclip className="size-3.5" /> Soporte
                </VisorPdf>
              ) : !x.conSoporte ? <Pill tone="warn">Sin soporte</Pill> : null}
            </div>
          ),
          extra: (puedeEditar || puedeEliminar) && (
            <div className="mt-2 flex justify-end gap-2">
              {puedeEliminar && (
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setBorrando(x)}>
                  <Trash2 className="size-4" /> Borrar
                </Button>
              )}
              {puedeEditar && (
                <Button size="sm" variant="outline" onClick={() => setEditando(x)}>
                  <Pencil className="size-4" /> Editar
                </Button>
              )}
            </div>
          ),
        }))}
      />
      {editando && <DialogIncapacidad inicial={editando} onClose={() => setEditando(null)} />}
      {borrando && <DialogBorrar item={borrando} onClose={() => setBorrando(null)} />}
    </>
  )
}

/** Registrar (sin `inicial`) o editar una incapacidad, con su soporte. */
export function DialogIncapacidad({ inicial, onClose }: { inicial?: IncapacidadItem; onClose: () => void }) {
  const router = useRouter()
  const [colaboradorId, setColaboradorId] = useState(inicial?.colaboradorId ?? '')
  const [tipo, setTipo] = useState(inicial?.tipo ?? 'ENFERMEDAD_GENERAL')
  const [inicio, setInicio] = useState(inicial?.fechaInicio ?? '')
  const [fin, setFin] = useState(inicial?.fechaFin ?? '')
  const [cie10, setCie10] = useState(inicial?.diagnosticoCie10 ?? '')
  const [entidad, setEntidad] = useState(inicial?.entidad ?? '')
  const [prorroga, setProrroga] = useState(inicial?.esProrroga ?? false)
  const [observaciones, setObservaciones] = useState(inicial?.observaciones ?? '')
  const [soporte, setSoporte] = useState<{ nombre: string; dataUri: string } | null>(null)
  const [g, setG] = useState(false)

  async function guardar() {
    if (!inicial && !colaboradorId) { toast.error('Selecciona un colaborador.'); return }
    if (!inicio || !fin) { toast.error('Indica desde y hasta cuándo.'); return }
    setG(true)
    const comunes = {
      tipo: tipo as 'ENFERMEDAD_GENERAL', fechaInicio: inicio, fechaFin: fin, diagnosticoCie10: cie10, entidad,
      esProrroga: prorroga, observaciones, soporte: soporte ? { dataUri: soporte.dataUri, nombre: soporte.nombre } : undefined,
    }
    const res = inicial ? await editarIncapacidad({ id: inicial.id, ...comunes }) : await registrarIncapacidad({ colaboradorId, ...comunes })
    setG(false)
    if (res.ok) { toast.success(inicial ? 'Incapacidad actualizada.' : 'Incapacidad registrada.'); onClose(); router.refresh() } else toast.error(res.error)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !g && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>{inicial ? `Incapacidad · ${inicial.colaborador}` : 'Registrar incapacidad'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {!inicial && <div className="space-y-1.5"><Label>Colaborador</Label><SelectorColaborador value={colaboradorId} onChange={setColaboradorId} /></div>}
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(TIPO_INCAP).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="inc-inicio">Desde</Label><Input id="inc-inicio" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="inc-fin">Hasta</Label><Input id="inc-fin" type="date" value={fin} onChange={(e) => setFin(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="inc-entidad">EPS / ARL</Label><Input id="inc-entidad" value={entidad} onChange={(e) => setEntidad(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="inc-cie">CIE-10</Label><Input id="inc-cie" value={cie10} onChange={(e) => setCie10(e.target.value)} placeholder="Opcional" /></div>
          </div>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={prorroga} onCheckedChange={(v) => setProrroga(Boolean(v))} /> Es prórroga</label>
          <Textarea aria-label="Observaciones" placeholder="Observaciones (opcional)" rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
          <div className="space-y-1.5">
            <Label htmlFor="inc-soporte">{inicial?.conSoporte ? 'Agregar otro soporte' : 'Soporte'}</Label>
            <ArchivoInput id="inc-soporte" archivo={soporte} onArchivo={setSoporte} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={g}>Cancelar</Button>
          <Button onClick={guardar} disabled={g}>{g && <Spinner />}{inicial ? 'Guardar' : 'Registrar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Borrar una incapacidad mal registrada, con el motivo (queda en auditoría). */
function DialogBorrar({ item, onClose }: { item: IncapacidadItem; onClose: () => void }) {
  const router = useRouter()
  const [motivo, setMotivo] = useState('')
  const [g, setG] = useState(false)

  async function borrar() {
    setG(true)
    const res = await eliminarIncapacidad({ id: item.id, motivo })
    setG(false)
    if (res.ok) { toast.success('Incapacidad borrada.'); onClose(); router.refresh() } else toast.error(res.error)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !g && onClose()}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader><DialogTitle>Borrar incapacidad</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          {item.colaborador} · {fecha(item.fechaInicio)} a {fecha(item.fechaFin)}{item.desdeAutoservicio ? ' · la solicitud del colaborador queda anulada' : ''}
        </p>
        <Textarea rows={2} placeholder="¿Por qué se borra?" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={g}>Cancelar</Button>
          <Button variant="destructive" onClick={borrar} disabled={g || motivo.trim().length < 5}>{g ? <Spinner /> : <Trash2 className="size-4" />} Borrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
