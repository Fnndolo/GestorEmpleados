'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Ban, History, Pencil, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Pill } from '@/components/ui-kit'
import { Pista } from '@/components/ui-kit/pista'
import { editarAsignacionHorario, anularAsignacionHorario } from '@/app/(app)/horarios/acciones'
import { DialogMotivo } from '@/app/(app)/configuracion/dialog-motivo'

export type AsignacionItem = {
  id: string
  /** AAAA-MM-DD */
  desde: string
  hasta: string | null
  horario: string
  resumen: string
  motivo: string | null
  origen: string
}

const fechaCorta = (iso: string) => iso.split('-').reverse().join('/')

/**
 * El historial de horarios de una persona, con un lápiz para corregir desde
 * cuándo rige cada uno y un botón para anular el que se registró por error
 * (vuelve a regir el anterior). Lo que una nómina cerrada ya pagó, el servidor
 * no lo deja tocar.
 */
export function HistorialHorario({ nombre, asignaciones, hoy, puedeEditar, puedeEliminar }: {
  nombre: string
  /** De la más reciente a la más antigua. */
  asignaciones: AsignacionItem[]
  hoy: string
  puedeEditar: boolean
  puedeEliminar: boolean
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [editando, setEditando] = useState<AsignacionItem | null>(null)
  const [anulando, setAnulando] = useState<AsignacionItem | null>(null)

  if (asignaciones.length === 0) return null

  return (
    <>
      <Pista texto="Historial de horarios">
        <Button size="icon" variant="ghost" className="size-8" onClick={() => setAbierto(true)} aria-label={`Historial de horarios de ${nombre}`}>
          <History className="size-4" />
        </Button>
      </Pista>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Historial de horarios</DialogTitle>
            <DialogDescription>{nombre}</DialogDescription>
          </DialogHeader>
          <ul className="divide-y rounded-lg border">
            {asignaciones.map((a) => {
              const estado = a.desde > hoy ? 'programado' : !a.hasta || a.hasta >= hoy ? 'vigente' : 'pasado'
              return (
                <li key={a.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{a.horario}</span>
                      {estado === 'vigente' && <Pill tone="ok">Vigente</Pill>}
                      {estado === 'programado' && <Pill tone="info">Programado</Pill>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {fechaCorta(a.desde)} – {a.hasta ? fechaCorta(a.hasta) : estado === 'programado' ? '' : 'hoy'} · {a.resumen}
                    </p>
                    {(a.motivo || a.origen === 'ASISTENCIA') && (
                      <p className="truncate text-xs text-muted-foreground">{[a.motivo, a.origen === 'ASISTENCIA' ? 'de AsistencIA' : null].filter(Boolean).join(' · ')}</p>
                    )}
                  </div>
                  {puedeEditar && (
                    <Button size="icon" variant="ghost" className="size-8" onClick={() => setEditando(a)} aria-label={`Corregir el horario desde ${fechaCorta(a.desde)}`} title="Corregir la fecha"><Pencil className="size-4" /></Button>
                  )}
                  {puedeEliminar && (
                    <Button size="icon" variant="ghost" className="size-8 text-destructive" onClick={() => setAnulando(a)} aria-label={`Anular el horario desde ${fechaCorta(a.desde)}`} title="Anular"><Ban className="size-4" /></Button>
                  )}
                </li>
              )
            })}
          </ul>
          <DialogFooter><Button variant="ghost" onClick={() => setAbierto(false)}>Cerrar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {editando && <DialogEditarAsignacion asignacion={editando} onClose={() => setEditando(null)} onDone={() => { setEditando(null); router.refresh() }} />}
      {anulando && (
        <DialogMotivo
          titulo="Anular horario"
          accion="anular"
          resumen={`${nombre} · ${anulando.horario} desde el ${fechaCorta(anulando.desde)}. Vuelve a regir el horario anterior; si se le envió la comunicación, se retira de sus documentos y se le avisa.`}
          placeholder="¿Por qué se anula?"
          onClose={() => setAnulando(null)}
          onConfirmar={async (motivo) => {
            const res = await anularAsignacionHorario({ asignacionId: anulando.id, motivo })
            if (res.ok) { toast.success('Anulado.'); router.refresh(); return true }
            toast.error(res.error, { duration: 8000 })
            return false
          }}
        />
      )}
    </>
  )
}

/** Corrige desde cuándo rige (y el motivo) de una asignación: la anterior se cierra el día antes. */
function DialogEditarAsignacion({ asignacion, onClose, onDone }: { asignacion: AsignacionItem; onClose: () => void; onDone: () => void }) {
  const uid = useId()
  const [desde, setDesde] = useState(asignacion.desde)
  const [motivo, setMotivo] = useState(asignacion.motivo ?? '')
  const [g, setG] = useState(false)

  async function guardar() {
    setG(true)
    const res = await editarAsignacionHorario({ asignacionId: asignacion.id, desde, motivo: motivo.trim() || undefined })
    setG(false)
    if (res.ok) { toast.success('Horario corregido.'); onDone() } else toast.error(res.error, { duration: 8000 })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !g && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Corregir horario</DialogTitle>
          <DialogDescription>{asignacion.horario} · {asignacion.resumen}. Para cambiar los días, asigna otro horario.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={`desde-${uid}`}>Desde <span className="text-destructive">*</span></Label>
            <Input id={`desde-${uid}`} type="date" value={desde} onChange={(e) => setDesde(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`motivo-${uid}`}>Motivo del cambio</Label>
            <Textarea id={`motivo-${uid}`} rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={g}>Cancelar</Button>
          <Button onClick={guardar} disabled={g || !desde}>{g ? <Spinner /> : <Save className="size-4" />} Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
