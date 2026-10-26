'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Banknote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DialogAnular, BotonAnular, BotonEditar } from '@/components/contratos/dialog-anular'
import { DialogProrroga, DialogSuspension } from './acciones-cliente'
import {
  editarProrroga, anularProrroga, editarOtrosi, anularOtrosi, editarSuspension, anularSuspension,
  editarVariacionSalarial, eliminarVariacionSalarial,
} from '../acciones'
import { TIPOS_CAMBIO_OTROSI, ETIQUETA_CAMBIO_OTROSI, type ValoresOtrosi } from '@/lib/otrosi'
import { fmtCOP } from '@/lib/moneda'
import { formatFechaCorta } from '@/lib/fechas'

type Cat = { cargos: { id: string; nombre: string }[]; sedes: { id: string; nombre: string; ciudad: string }[] }

/* ——— Prórroga ——— */

export function AccionesProrroga({ prorroga, esUltima, puedeEditar, puedeEliminar }: {
  prorroga: { id: string; numero: number; fechaInicio: string; fechaFin: string; fechaFirma: string }
  esUltima: boolean
  puedeEditar: boolean
  puedeEliminar: boolean
}) {
  const [dialogo, setDialogo] = useState<'editar' | 'anular' | null>(null)
  const bloqueo = esUltima ? null : 'Solo se anula la prórroga más reciente: las anteriores ya quedaron cubiertas por las que siguieron.'
  return (
    <>
      {puedeEditar && <BotonEditar onClick={() => setDialogo('editar')} etiqueta={`Editar prórroga ${prorroga.numero}`} />}
      {puedeEliminar && <BotonAnular onClick={() => setDialogo('anular')} motivoBloqueo={bloqueo} etiqueta={`Anular prórroga ${prorroga.numero}`} soloIcono />}
      {dialogo === 'editar' && (
        <DialogProrroga
          inicial={prorroga}
          guardar={(d) => editarProrroga({ id: prorroga.id, ...d })}
          onClose={() => setDialogo(null)}
        />
      )}
      {dialogo === 'anular' && (
        <DialogAnular
          titulo={`Anular prórroga ${prorroga.numero}`}
          detalle={`${formatFechaCorta(new Date(prorroga.fechaInicio))} a ${formatFechaCorta(new Date(prorroga.fechaFin))} · el contrato vuelve a la fecha de fin que tenía antes de esta prórroga y se borra su PDF.`}
          accion={(motivo) => anularProrroga({ id: prorroga.id, motivo })}
          onClose={() => setDialogo(null)}
        />
      )}
    </>
  )
}

/* ——— Suspensión ——— */

export function AccionesSuspension({ suspension, puedeEditar, puedeEliminar }: {
  suspension: { id: string; fechaInicio: string; fechaFin: string; causa: string; descripcion: string; etiquetaCausa: string }
  puedeEditar: boolean
  puedeEliminar: boolean
}) {
  const [dialogo, setDialogo] = useState<'editar' | 'anular' | null>(null)
  const rango = `${formatFechaCorta(new Date(suspension.fechaInicio))}${suspension.fechaFin ? ` a ${formatFechaCorta(new Date(suspension.fechaFin))}` : ' · sin fecha de fin'}`
  return (
    <>
      {puedeEditar && <BotonEditar onClick={() => setDialogo('editar')} etiqueta="Editar suspensión" />}
      {puedeEliminar && <BotonAnular onClick={() => setDialogo('anular')} etiqueta="Anular suspensión" soloIcono />}
      {dialogo === 'editar' && (
        <DialogSuspension
          inicial={suspension}
          guardar={(d) => editarSuspension({ id: suspension.id, ...d })}
          onClose={() => setDialogo(null)}
        />
      )}
      {dialogo === 'anular' && (
        <DialogAnular
          titulo="Anular suspensión"
          detalle={`${suspension.etiquetaCausa} · ${rango} · si no quedan suspensiones vigentes, el contrato vuelve a Activo.`}
          accion={(motivo) => anularSuspension({ id: suspension.id, motivo })}
          onClose={() => setDialogo(null)}
        />
      )}
    </>
  )
}

/* ——— Otrosí ——— */

export type OtrosiEditable = {
  id: string
  numero: number
  fecha: string
  descripcion: string
  tiposCambio: string[]
  valoresNuevos: ValoresOtrosi | null
  firmado: boolean
  requiereFirma: boolean
}

export function AccionesOtrosi({ otrosi, esUltimo, puedeEditar, puedeEliminar, cargos, sedes }: {
  otrosi: OtrosiEditable
  esUltimo: boolean
  puedeEditar: boolean
  puedeEliminar: boolean
} & Cat) {
  const [dialogo, setDialogo] = useState<'editar' | 'anular' | null>(null)
  const bloqueoFirma = otrosi.firmado ? `El otrosí ${otrosi.numero} ya está firmado por el trabajador: no se puede cambiar ni anular.` : null
  const bloqueoAnular = bloqueoFirma ?? (esUltimo ? null : 'Solo se anula el otrosí más reciente: los anteriores ya quedaron pisados por los que siguieron.')
  return (
    <>
      {puedeEditar && <BotonEditar onClick={() => setDialogo('editar')} motivoBloqueo={bloqueoFirma} etiqueta={`Editar otrosí ${otrosi.numero}`} />}
      {puedeEliminar && <BotonAnular onClick={() => setDialogo('anular')} motivoBloqueo={bloqueoAnular} etiqueta={`Anular otrosí ${otrosi.numero}`} soloIcono />}
      {dialogo === 'editar' && <DialogEditarOtrosi otrosi={otrosi} esUltimo={esUltimo} cargos={cargos} sedes={sedes} onClose={() => setDialogo(null)} />}
      {dialogo === 'anular' && (
        <DialogAnular
          titulo={`Anular otrosí ${otrosi.numero}`}
          detalle={`${otrosi.tiposCambio.map((t) => ETIQUETA_CAMBIO_OTROSI[t as keyof typeof ETIQUETA_CAMBIO_OTROSI] ?? t).join(', ')} · se borran sus PDF y el contrato vuelve a los valores anteriores.`}
          nota={otrosi.requiereFirma ? '· al trabajador se le avisa que ya no tiene que firmarlo.' : undefined}
          accion={(motivo) => anularOtrosi({ id: otrosi.id, motivo })}
          onClose={() => setDialogo(null)}
        />
      )}
    </>
  )
}

/**
 * Corregir lo pactado en un otrosí sin firmar: los mismos campos que al
 * registrarlo, menos el PDF (si el documento está mal, se anula y se registra
 * de nuevo). En un otrosí que no es el último solo se corrigen fecha y descripción.
 */
function DialogEditarOtrosi({ otrosi, esUltimo, cargos, sedes, onClose }: { otrosi: OtrosiEditable; esUltimo: boolean; onClose: () => void } & Cat) {
  const router = useRouter()
  const vn = otrosi.valoresNuevos ?? {}
  const [tipos, setTipos] = useState<string[]>(otrosi.tiposCambio)
  const [fecha, setFecha] = useState(otrosi.fecha)
  const [descripcion, setDescripcion] = useState(otrosi.descripcion)
  const [salario, setSalario] = useState(vn.salario != null ? String(vn.salario) : '')
  const [cargoId, setCargoId] = useState(cargos.find((c) => c.nombre === vn.cargo)?.id ?? '')
  const [sedeId, setSedeId] = useState(sedes.find((s) => s.nombre === vn.sede)?.id ?? '')
  const [modalidad, setModalidad] = useState(vn.modalidad ?? '')
  const [fechaInicio, setFechaInicio] = useState(vn.fechaInicio ?? '')
  const [fechaFin, setFechaFin] = useState(vn.fechaFin ?? '')
  const [g, setG] = useState(false)

  const duracion = tipos.includes('DURACION')
  const periodoInvertido = Boolean(fechaInicio && fechaFin && fechaFin < fechaInicio)
  const duracionIncompleta = duracion && (!fechaInicio || !fechaFin || periodoInvertido)
  function toggle(t: string, c: boolean) { setTipos((p) => c ? [...p, t] : p.filter((x) => x !== t)) }

  async function guardar() {
    setG(true)
    const res = await editarOtrosi({
      id: otrosi.id, fecha, descripcion,
      tiposCambio: tipos as ('SALARIO')[],
      salarioNuevo: salario ? Number(salario) : undefined,
      cargoNuevoId: cargoId, sedeNuevaId: sedeId,
      modalidadNueva: (modalidad || undefined) as 'PRESENCIAL' | undefined,
      fechaInicioNueva: duracion ? fechaInicio : '',
      fechaFinNueva: duracion ? fechaFin : '',
    })
    setG(false)
    if (res.ok) { toast.success('Otrosí actualizado.'); onClose(); router.refresh() } else toast.error(res.error, { duration: 8000 })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar otrosí {otrosi.numero}</DialogTitle>
          <DialogDescription>
            {esUltimo
              ? 'Corrige lo pactado antes de que el trabajador firme. El PDF no cambia: si el documento está mal, anula el otrosí y regístralo de nuevo.'
              : 'Este no es el otrosí más reciente: solo se corrigen la fecha y la descripción.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="eo-fecha">Fecha del otrosí</Label><Input id="eo-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={duracion} /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="eo-desc">Descripción</Label><Textarea id="eo-desc" rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>Tipos de cambio <span className="text-destructive">*</span></Label>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {TIPOS_CAMBIO_OTROSI.map((t) => (
                <label key={t} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={tipos.includes(t)} disabled={!esUltimo} onCheckedChange={(c) => toggle(t, Boolean(c))} /> {ETIQUETA_CAMBIO_OTROSI[t]}
                </label>
              ))}
            </div>
          </div>
          {tipos.includes('SALARIO') && <div className="space-y-1.5"><Label htmlFor="eo-salario">Nuevo salario <span className="text-destructive">*</span></Label><Input id="eo-salario" type="number" value={salario} disabled={!esUltimo} onChange={(e) => setSalario(e.target.value)} /></div>}
          {tipos.includes('CARGO') && (
            <div className="space-y-1.5"><Label>Nuevo cargo <span className="text-destructive">*</span></Label>
              <Select value={cargoId || undefined} onValueChange={setCargoId} disabled={!esUltimo}><SelectTrigger className="w-full"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                <SelectContent>{cargos.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent></Select>
            </div>
          )}
          {tipos.includes('SEDE') && (
            <div className="space-y-1.5"><Label>Nueva sede <span className="text-destructive">*</span></Label>
              <Select value={sedeId || undefined} onValueChange={setSedeId} disabled={!esUltimo}><SelectTrigger className="w-full"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                <SelectContent>{sedes.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre} · {s.ciudad}</SelectItem>)}</SelectContent></Select>
            </div>
          )}
          {tipos.includes('MODALIDAD_TRABAJO') && (
            <div className="space-y-1.5"><Label>Nueva modalidad <span className="text-destructive">*</span></Label>
              <Select value={modalidad || undefined} onValueChange={setModalidad} disabled={!esUltimo}><SelectTrigger className="w-full"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRESENCIAL">Presencial</SelectItem><SelectItem value="REMOTO">Remoto</SelectItem><SelectItem value="HIBRIDO">Híbrido</SelectItem>
                </SelectContent></Select>
            </div>
          )}
          {duracion && (
            <div className="space-y-1.5">
              <Label>Nuevo periodo <span className="text-destructive">*</span></Label>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input type="date" value={fechaInicio} disabled={!esUltimo} onChange={(e) => setFechaInicio(e.target.value)} aria-label="Fecha de inicio" />
                <Input type="date" value={fechaFin} disabled={!esUltimo} onChange={(e) => setFechaFin(e.target.value)} aria-label="Fecha de fin" />
              </div>
              {periodoInvertido && <p className="text-xs text-destructive">La fecha de fin debe ser igual o posterior a la de inicio.</p>}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={g || tipos.length === 0 || duracionIncompleta}>{g && <Spinner />}Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ——— Historial salarial ——— */

export type VariacionFila = {
  id: string
  fechaVigencia: string
  salarioAnterior: number
  salarioNuevo: number
  motivo: string
  /** Nació de un otrosí: se corrige o anula desde el otrosí. */
  deOtrosi: number | null
}

export function HistorialSalarial({ variaciones, puedeEditar, puedeEliminar }: { variaciones: VariacionFila[]; puedeEditar: boolean; puedeEliminar: boolean }) {
  const [editando, setEditando] = useState<VariacionFila | null>(null)
  const [anulando, setAnulando] = useState<VariacionFila | null>(null)
  if (variaciones.length === 0) return null
  return (
    <>
      <h2 className="text-sm font-semibold">Historial salarial</h2>
      <ul className="divide-y">
        {variaciones.map((vs) => {
          const sube = vs.salarioNuevo >= vs.salarioAnterior
          const bloqueo = vs.deOtrosi ? `Nació del otrosí ${vs.deOtrosi}: corrígela o anúlala desde el otrosí, en Modificaciones.` : null
          return (
            <li key={vs.id} className="flex items-center gap-3 py-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><Banknote className="size-4" /></span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 text-sm">
                  <span className="tabular-nums">{fmtCOP(vs.salarioAnterior)}</span>
                  <span className={sube ? 'font-bold text-emerald-600 dark:text-emerald-400' : 'font-bold text-rose-600 dark:text-rose-400'}>→</span>
                  <span className="font-medium tabular-nums">{fmtCOP(vs.salarioNuevo)}</span>
                </p>
                <p className="truncate text-xs text-muted-foreground">Desde {formatFechaCorta(new Date(vs.fechaVigencia))}{vs.motivo ? ` · ${vs.motivo}` : ''}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {puedeEditar && <BotonEditar onClick={() => setEditando(vs)} motivoBloqueo={bloqueo} etiqueta="Editar variación salarial" />}
                {puedeEliminar && <BotonAnular onClick={() => setAnulando(vs)} motivoBloqueo={bloqueo} etiqueta="Eliminar variación salarial" icono="eliminar" soloIcono />}
              </div>
            </li>
          )
        })}
      </ul>
      {editando && <DialogVariacion variacion={editando} onClose={() => setEditando(null)} />}
      {anulando && (
        <DialogAnular
          titulo="Eliminar variación salarial"
          detalle={`${fmtCOP(anulando.salarioAnterior)} → ${fmtCOP(anulando.salarioNuevo)} desde ${formatFechaCorta(new Date(anulando.fechaVigencia))} · si es la más reciente, el contrato vuelve al salario anterior.`}
          verbo="Eliminar"
          mensajeOk="Eliminada."
          accion={(motivo) => eliminarVariacionSalarial({ id: anulando.id, motivo })}
          onClose={() => setAnulando(null)}
        />
      )}
    </>
  )
}

function DialogVariacion({ variacion, onClose }: { variacion: VariacionFila; onClose: () => void }) {
  const router = useRouter()
  const [salario, setSalario] = useState(String(variacion.salarioNuevo))
  const [fecha, setFecha] = useState(variacion.fechaVigencia)
  const [motivo, setMotivo] = useState(variacion.motivo)
  const [g, setG] = useState(false)
  async function guardar() {
    setG(true)
    const res = await editarVariacionSalarial({ id: variacion.id, salarioNuevo: Number(salario), fechaVigencia: fecha, motivo })
    setG(false)
    if (res.ok) { toast.success('Variación actualizada.'); onClose(); router.refresh() } else toast.error(res.error, { duration: 8000 })
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar variación salarial</DialogTitle>
          <DialogDescription>Salario anterior: {fmtCOP(variacion.salarioAnterior)}. Si es la variación más reciente, el salario del contrato queda en el valor corregido.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="vs-salario">Nuevo salario <span className="text-destructive">*</span></Label><Input id="vs-salario" type="number" value={salario} onChange={(e) => setSalario(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="vs-fecha">Rige desde <span className="text-destructive">*</span></Label><Input id="vs-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="vs-motivo">Motivo</Label><Input id="vs-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={g || !salario || !fecha}>{g && <Spinner />}Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
