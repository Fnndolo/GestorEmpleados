'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarPlus, FilePen, CirclePause, CirclePlay } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { agregarProrroga, agregarOtrosi, registrarSuspension, reactivarContrato } from '../acciones'

type Cat = { cargos: { id: string; nombre: string }[]; sedes: { id: string; nombre: string; ciudad: string }[] }

export function AccionesContrato({
  contratoId, tipo, estado, cargos, sedes,
}: { contratoId: string; tipo: string; estado: string } & Cat) {
  const router = useRouter()
  const [dialogo, setDialogo] = useState<'prorroga' | 'otrosi' | 'suspension' | null>(null)
  const [cargando, setCargando] = useState(false)

  async function reactivar() {
    setCargando(true)
    const res = await reactivarContrato({ id: contratoId })
    setCargando(false)
    if (res.ok) { toast.success('Contrato reactivado.'); router.refresh() }
    else toast.error(res.error)
  }

  return (
    <Card><CardContent className="py-4">
      <h3 className="text-sm font-medium mb-3">Acciones</h3>
      <div className="flex flex-wrap gap-2">
        {tipo === 'TERMINO_FIJO' && (
          <Button size="sm" variant="outline" onClick={() => setDialogo('prorroga')}><CalendarPlus className="size-4" /> Prórroga</Button>
        )}
        <Button size="sm" variant="outline" onClick={() => setDialogo('otrosi')}><FilePen className="size-4" /> Otrosí</Button>
        {estado !== 'SUSPENDIDO' ? (
          <Button size="sm" variant="outline" onClick={() => setDialogo('suspension')}><CirclePause className="size-4" /> Suspender</Button>
        ) : (
          <Button size="sm" variant="outline" onClick={reactivar} disabled={cargando}>
            {cargando ? <Spinner /> : <CirclePlay className="size-4" />} Reactivar
          </Button>
        )}
      </div>

      {dialogo === 'prorroga' && <DialogProrroga contratoId={contratoId} onClose={() => setDialogo(null)} onDone={() => { setDialogo(null); router.refresh() }} />}
      {dialogo === 'otrosi' && <DialogOtrosi contratoId={contratoId} cargos={cargos} sedes={sedes} onClose={() => setDialogo(null)} onDone={() => { setDialogo(null); router.refresh() }} />}
      {dialogo === 'suspension' && <DialogSuspension contratoId={contratoId} onClose={() => setDialogo(null)} onDone={() => { setDialogo(null); router.refresh() }} />}
    </CardContent></Card>
  )
}

function DialogProrroga({ contratoId, onClose, onDone }: { contratoId: string; onClose: () => void; onDone: () => void }) {
  const [ini, setIni] = useState('')
  const [fin, setFin] = useState('')
  const [firma, setFirma] = useState('')
  const [g, setG] = useState(false)
  async function guardar() {
    setG(true)
    const res = await agregarProrroga({ contratoId, fechaInicio: ini, fechaFin: fin, fechaFirma: firma })
    setG(false)
    if (res.ok) { toast.success('Prórroga registrada.'); onDone() } else toast.error(res.error)
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Registrar prórroga</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>Fecha de inicio</Label><Input type="date" value={ini} onChange={(e) => setIni(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Fecha de fin</Label><Input type="date" value={fin} onChange={(e) => setFin(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Fecha de firma</Label><Input type="date" value={firma} onChange={(e) => setFirma(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={g || !ini || !fin}>{g && <Spinner />}Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const CAMBIOS = [
  { v: 'SALARIO', l: 'Salario' }, { v: 'CARGO', l: 'Cargo' }, { v: 'SEDE', l: 'Sede' },
  { v: 'MODALIDAD_TRABAJO', l: 'Modalidad' }, { v: 'JORNADA', l: 'Jornada' },
  { v: 'FUNCIONES', l: 'Funciones' }, { v: 'DURACION', l: 'Duración' }, { v: 'OTRO', l: 'Otro' },
]

function DialogOtrosi({ contratoId, cargos, sedes, onClose, onDone }: { contratoId: string } & Cat & { onClose: () => void; onDone: () => void }) {
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [tipos, setTipos] = useState<string[]>([])
  const [descripcion, setDescripcion] = useState('')
  const [salario, setSalario] = useState('')
  const [cargoId, setCargoId] = useState('')
  const [sedeId, setSedeId] = useState('')
  const [modalidad, setModalidad] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [g, setG] = useState(false)

  function toggle(v: string, c: boolean) { setTipos((p) => c ? [...p, v] : p.filter((x) => x !== v)) }

  async function guardar() {
    setG(true)
    const res = await agregarOtrosi({
      contratoId, fecha, tiposCambio: tipos as ('SALARIO')[], descripcion,
      salarioNuevo: salario ? Number(salario) : undefined,
      cargoNuevoId: cargoId, sedeNuevaId: sedeId,
      modalidadNueva: (modalidad || undefined) as 'PRESENCIAL' | undefined,
      fechaFinNueva: fechaFin,
    })
    setG(false)
    if (res.ok) { toast.success('Otrosí registrado.'); onDone() } else toast.error(res.error)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Registrar otrosí</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>Fecha</Label><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>Tipos de cambio</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {CAMBIOS.map((c) => (
                <label key={c.v} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={tipos.includes(c.v)} onCheckedChange={(v) => toggle(c.v, Boolean(v))} /> {c.l}
                </label>
              ))}
            </div>
          </div>
          {tipos.includes('SALARIO') && <div className="space-y-1.5"><Label>Nuevo salario</Label><Input type="number" value={salario} onChange={(e) => setSalario(e.target.value)} /></div>}
          {tipos.includes('CARGO') && (
            <div className="space-y-1.5"><Label>Nuevo cargo</Label>
              <Select value={cargoId || undefined} onValueChange={setCargoId}><SelectTrigger className="w-full"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                <SelectContent>{cargos.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent></Select>
            </div>
          )}
          {tipos.includes('SEDE') && (
            <div className="space-y-1.5"><Label>Nueva sede</Label>
              <Select value={sedeId || undefined} onValueChange={setSedeId}><SelectTrigger className="w-full"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                <SelectContent>{sedes.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre} · {s.ciudad}</SelectItem>)}</SelectContent></Select>
            </div>
          )}
          {tipos.includes('MODALIDAD_TRABAJO') && (
            <div className="space-y-1.5"><Label>Nueva modalidad</Label>
              <Select value={modalidad || undefined} onValueChange={setModalidad}><SelectTrigger className="w-full"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRESENCIAL">Presencial</SelectItem><SelectItem value="REMOTO">Remoto</SelectItem>
                  <SelectItem value="HIBRIDO">Híbrido</SelectItem><SelectItem value="TELETRABAJO">Teletrabajo</SelectItem>
                </SelectContent></Select>
            </div>
          )}
          {tipos.includes('DURACION') && <div className="space-y-1.5"><Label>Nueva fecha de fin</Label><Input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} /></div>}
          <div className="space-y-1.5"><Label>Descripción</Label><Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={g || tipos.length === 0 || descripcion.length < 3}>{g && <Spinner />}Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DialogSuspension({ contratoId, onClose, onDone }: { contratoId: string; onClose: () => void; onDone: () => void }) {
  const [ini, setIni] = useState('')
  const [fin, setFin] = useState('')
  const [causa, setCausa] = useState('LICENCIA_NO_REMUNERADA')
  const [desc, setDesc] = useState('')
  const [g, setG] = useState(false)
  async function guardar() {
    setG(true)
    const res = await registrarSuspension({ contratoId, fechaInicio: ini, fechaFin: fin, causa: causa as 'OTRO', descripcion: desc })
    setG(false)
    if (res.ok) { toast.success('Suspensión registrada.'); onDone() } else toast.error(res.error)
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Suspender contrato</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>Causa</Label>
            <Select value={causa} onValueChange={setCausa}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SANCION_DISCIPLINARIA">Sanción disciplinaria</SelectItem>
                <SelectItem value="LICENCIA_NO_REMUNERADA">Licencia no remunerada</SelectItem>
                <SelectItem value="FUERZA_MAYOR">Fuerza mayor</SelectItem>
                <SelectItem value="OTRO">Otro</SelectItem>
              </SelectContent></Select>
          </div>
          <div className="space-y-1.5"><Label>Fecha de inicio</Label><Input type="date" value={ini} onChange={(e) => setIni(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Fecha de fin (opcional)</Label><Input type="date" value={fin} onChange={(e) => setFin(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Descripción</Label><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={g || !ini}>{g && <Spinner />}Suspender</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
