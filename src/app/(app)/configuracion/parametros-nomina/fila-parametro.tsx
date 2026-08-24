'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { CalendarPlus, ChevronRight, Paperclip, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BotonEliminar } from '@/components/ui-kit/boton-eliminar'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { cn } from '@/lib/utils'
import { fmtValor } from './formato'
import { crearParametro, eliminarParametro, eliminarVigenciaParametro } from './acciones'
import type { ParametroItem, VigenciaItem } from './form'

/**
 * Una clave con su valor vigente y, al desplegar, todas sus vigencias.
 *
 * El histórico importa tanto como el valor de hoy: una liquidación de 2025 se
 * calculó con el SMMLV de 2025, y sin poder consultarlo no hay cómo explicar la
 * cifra ante una revisión. Las filas existían desde siempre en la base; lo que
 * faltaba era dónde verlas.
 */
export function FilaParametro({
  p, puedeEditar, onNuevaVigencia, onCambio,
}: {
  p: ParametroItem
  puedeEditar: boolean
  onNuevaVigencia: () => void
  onCambio: () => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [ocupado, setOcupado] = useState(false)

  async function borrarParametro() {
    if (!confirm(`¿Eliminar ${p.clave} con todo su histórico? No se puede deshacer.`)) return
    setOcupado(true)
    const res = await eliminarParametro({ clave: p.clave })
    setOcupado(false)
    if (res.ok) { toast.success(`${p.clave} eliminado.`); onCambio() }
    else toast.error(res.error, { duration: 8000 })
  }

  async function borrarVigencia(v: VigenciaItem) {
    if (!confirm(`¿Eliminar la vigencia desde ${v.desde}? Si era la última, vuelve a regir la anterior.`)) return
    setOcupado(true)
    const res = await eliminarVigenciaParametro({ id: v.id })
    setOcupado(false)
    if (res.ok) { toast.success('Vigencia eliminada.'); onCambio() }
    else toast.error(res.error, { duration: 8000 })
  }

  return (
    <div className="px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          onClick={() => setAbierto((a) => !a)}
          className="min-w-0 flex-1 text-left"
          aria-expanded={abierto}
        >
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
            <ChevronRight className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', abierto && 'rotate-90')} />
            {p.clave}
            {!p.vigente && <Badge variant="secondary" className="text-[10px]">Sin vigencia actual</Badge>}
            {p.historial.length > 1 && (
              <span className="text-[10px] font-normal text-muted-foreground">{p.historial.length} vigencias</span>
            )}
          </p>
          <p className="truncate pl-5 text-xs text-muted-foreground">
            {p.descripcion ?? p.clave} · desde {p.desde}
          </p>
          {/* La fuente legal se guardaba desde el principio, pero la lista mostraba
              la descripción O la fuente: con descripción, la norma que sustenta la
              cifra no se veía en ninguna pantalla. */}
          <p className="truncate pl-5 text-xs text-muted-foreground/80">{p.fuente}</p>
        </button>
        <p className="shrink-0 text-sm font-bold tabular-nums">{fmtValor(p.valor)}</p>
        {puedeEditar && (
          <div className="flex shrink-0 items-center gap-1">
            <Button size="sm" variant="outline" onClick={onNuevaVigencia}>
              <CalendarPlus className="size-4" /> Nueva vigencia
            </Button>
            <BotonEliminar
              onEliminar={borrarParametro}
              motivoBloqueo={p.delMotor
                ? `${p.clave} la usa el motor de nómina para calcular: no se puede eliminar. Si el valor cambió, registra una nueva vigencia.`
                : null}
            />
          </div>
        )}
      </div>

      {abierto && (
        <ul className="mt-2 space-y-1.5 border-l pl-5">
          {p.historial.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium tabular-nums">{fmtValor(v.valor)}</span>
              <span className="text-muted-foreground">{v.desde} → {v.hasta ?? 'vigente'}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground/80">{v.fuente}</span>
              {v.soporte ? (
                <VisorPdf
                  documentoId={v.soporte.id}
                  titulo={`${p.clave} — ${v.fuente}`}
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <Paperclip className="size-3.5" /> Soporte
                </VisorPdf>
              ) : puedeEditar ? (
                <SubirSoporteVigencia vigenciaId={v.id} onSubido={onCambio} />
              ) : null}
              {puedeEditar && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  disabled={ocupado}
                  onClick={() => borrarVigencia(v)}
                  aria-label={`Eliminar la vigencia desde ${v.desde}`}
                >
                  <Trash2 className="size-3.5 text-destructive" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Adjunta a una vigencia el PDF de la norma que la sustenta.
 *
 * La fuente legal es texto que alguien escribió a mano; el decreto es lo que
 * pediría un auditor para creerle a la cifra.
 */
function SubirSoporteVigencia({ vigenciaId, onSubido }: { vigenciaId: string; onSubido: () => void }) {
  const [subiendo, setSubiendo] = useState(false)

  async function subir(file: File) {
    setSubiendo(true)
    const fd = new FormData()
    fd.set('archivo', file)
    fd.set('entidadTipo', 'VigenciaParametro')
    fd.set('entidadId', vigenciaId)
    fd.set('nombre', file.name.replace(/\.[^.]+$/, ''))
    const resp = await fetch('/api/documentos/subir', { method: 'POST', body: fd }).catch(() => null)
    setSubiendo(false)
    if (resp?.ok) { toast.success('Soporte adjuntado.'); onSubido() }
    else toast.error('No se pudo adjuntar el soporte.')
  }

  return (
    <label className="inline-flex cursor-pointer items-center gap-1 text-muted-foreground hover:text-primary">
      {subiendo ? <Spinner /> : <Paperclip className="size-3.5" />} Adjuntar norma
      <input
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f); e.target.value = '' }}
      />
    </label>
  )
}

/** Crea una clave que no existía: propia de la empresa, o una de ley que falte. */
export function DialogNuevoParametro({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [clave, setClave] = useState('')
  const [valor, setValor] = useState('')
  const [desde, setDesde] = useState('')
  const [fuente, setFuente] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [g, setG] = useState(false)

  async function guardar() {
    if (!clave.trim()) { toast.error('Indica la clave.'); return }
    if (!desde) { toast.error('Indica desde cuándo rige.'); return }
    setG(true)
    const res = await crearParametro({
      clave: clave.trim().toUpperCase(),
      valor: Number(valor) || 0,
      vigenciaDesde: desde,
      fuenteLegal: fuente || undefined,
      descripcion: descripcion || undefined,
    })
    setG(false)
    if (res.ok) { toast.success(`Parámetro ${clave.toUpperCase()} creado.`); onDone() }
    else toast.error(res.error, { duration: 8000 })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo parámetro</DialogTitle>
          <DialogDescription>
            Para una clave propia de la empresa, o para reponer una de ley que falte. Si ya existe,
            cámbiale el valor con «Nueva vigencia» en vez de crearla otra vez.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Clave</Label>
            <Input value={clave} onChange={(e) => setClave(e.target.value.toUpperCase())} placeholder="SMMLV, TOPE_VIATICOS…" />
            <p className="text-xs text-muted-foreground">
              En MAYÚSCULAS y con guion bajo. El motor de nómina busca sus valores por esta clave
              exacta: una clave inventada no entra en ningún cálculo, queda como referencia.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Valor</Label>
              <Input type="number" step="any" value={valor} onChange={(e) => setValor(e.target.value)} />
              <p className="text-xs text-muted-foreground">Porcentajes en decimal: 0.04 = 4%.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Rige desde</Label>
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Descripción (opcional)</Label>
            <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Salario mínimo 2026" />
          </div>
          <div className="space-y-1.5">
            <Label>Fuente legal (opcional)</Label>
            <Textarea rows={2} value={fuente} onChange={(e) => setFuente(e.target.value)} placeholder="Decreto, ley o resolución" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={g}>{g ? <Spinner /> : <Save className="size-4" />} Crear</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
