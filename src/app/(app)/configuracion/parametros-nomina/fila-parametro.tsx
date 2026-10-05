'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
import { BotonAgregar } from '@/components/ui-kit/boton-agregar'
import { Ayuda } from '@/components/ui-kit/ayuda'
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
    <div className="px-3 py-2.5 sm:px-4">
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={() => setAbierto((a) => !a)}
          className="min-w-0 flex-1 text-left"
          aria-expanded={abierto}
        >
          {/* El valor va en la primera línea, para que la de abajo use todo el ancho. */}
          <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
            <ChevronRight className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', abierto && 'rotate-90')} />
            <span className="truncate">{p.clave}</span>
            {!p.vigente && (
              <Badge variant="secondary" className="shrink-0 text-[10px]">Sin vigencia<span className="max-sm:hidden">{'\u00a0'}actual</span></Badge>
            )}
            <span className="ml-auto shrink-0 pl-2 font-bold tabular-nums">{fmtValor(p.valor)}</span>
          </span>
          {/* Una sola línea. En el celular solo cabe la descripción (la fecha y la
              fuente se ven al desplegar el histórico); en pantallas anchas se
              recorta primero la fuente y luego la descripción, nunca la fecha.
              El separador de la fuente lleva un espacio duro porque `truncate` se
              come los espacios del borde y pegaría el punto a la palabra anterior. */}
          <span className="flex min-w-0 whitespace-pre pl-5 text-xs text-muted-foreground" title={p.fuente || undefined}>
            {p.descripcion && <span className="truncate">{p.descripcion}</span>}
            <span className={cn('shrink-0', p.descripcion && 'max-sm:hidden')}>{p.descripcion ? ' · ' : ''}desde {p.desde}</span>
            {p.historial.length > 1 && <span className="shrink-0 max-sm:hidden"> · {p.historial.length} vigencias</span>}
            {p.fuente && <span className="min-w-0 shrink-[999] truncate text-muted-foreground/80 max-sm:hidden">{'\u00a0· '}{p.fuente}</span>}
          </span>
        </button>
        {puedeEditar && (
          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
            <Button
              size="sm" variant="outline" className="max-sm:size-8 max-sm:px-0"
              onClick={onNuevaVigencia}
              aria-label={`Nueva vigencia de ${p.clave}`} title="Nueva vigencia"
            >
              <CalendarPlus className="size-4" /> <span className="max-sm:sr-only">Nueva vigencia</span>
            </Button>
            <BotonEliminar
              onEliminar={borrarParametro}
              etiqueta={`Eliminar ${p.clave}`}
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
            <li key={v.id} className="flex items-center gap-2 text-xs">
              <div className="min-w-0 flex-1">
                <p className="truncate tabular-nums">
                  <span className="font-medium">{fmtValor(v.valor)}</span>
                  <span className="text-muted-foreground"> · {v.desde} → {v.hasta ?? 'vigente'}</span>
                </p>
                {v.fuente && <p className="truncate text-muted-foreground/80" title={v.fuente}>{v.fuente}</p>}
              </div>
              {v.soporte ? (
                <VisorPdf
                  documentoId={v.soporte.id}
                  titulo={`${p.clave} — ${v.fuente}`}
                  className="inline-flex shrink-0 items-center gap-1 text-primary hover:underline"
                >
                  <Paperclip className="size-3.5" /> <span className="max-sm:sr-only">Soporte</span>
                </VisorPdf>
              ) : puedeEditar ? (
                <SubirSoporteVigencia vigenciaId={v.id} onSubido={onCambio} />
              ) : null}
              {puedeEditar && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 shrink-0"
                  disabled={ocupado}
                  onClick={() => borrarVigencia(v)}
                  aria-label={`Eliminar la vigencia desde ${v.desde}`}
                  title="Eliminar esta vigencia"
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
    <label className="inline-flex shrink-0 cursor-pointer items-center gap-1 text-muted-foreground hover:text-primary" title="Adjuntar la norma (PDF o imagen)">
      {subiendo ? <Spinner /> : <Paperclip className="size-3.5" />} <span className="max-sm:sr-only">Adjuntar norma</span>
      <input
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f); e.target.value = '' }}
      />
    </label>
  )
}

/**
 * El + del encabezado de la página. Lleva su propio estado para que la página
 * (server) lo pueda poner en el encabezado sin volverse cliente.
 */
export function NuevoParametro() {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  return (
    <>
      <BotonAgregar etiqueta="Nuevo parámetro" onClick={() => setAbierto(true)} />
      {abierto && (
        <DialogNuevoParametro onClose={() => setAbierto(false)} onDone={() => { setAbierto(false); router.refresh() }} />
      )}
    </>
  )
}

/** Crea una clave que no existía: propia de la empresa, o una de ley que falte. */
function DialogNuevoParametro({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
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
          <DialogDescription>Si la clave ya existe, registra una nueva vigencia.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="gap-1.5">
              Clave <span className="text-destructive">*</span>
              <Ayuda
                texto="Para una clave propia de la empresa, o para reponer una de ley que falte. En MAYÚSCULAS y con guion bajo: el motor de nómina busca sus valores por esta clave exacta; una clave inventada no entra en ningún cálculo, queda como referencia."
                etiqueta="Sobre la clave"
              />
            </Label>
            {/* autoFocus: si no, el diálogo enfoca el ⓘ (va antes) y abre su texto encima del título. */}
            <Input value={clave} onChange={(e) => setClave(e.target.value.toUpperCase())} placeholder="SMMLV, TOPE_VIATICOS…" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="gap-1.5">
                Valor <span className="text-destructive">*</span>
                <Ayuda texto="Porcentajes en decimal: 0.04 = 4%." etiqueta="Cómo escribir el valor" />
              </Label>
              <Input type="number" step="any" value={valor} onChange={(e) => setValor(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Rige desde <span className="text-destructive">*</span></Label>
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Salario mínimo 2026" />
          </div>
          <div className="space-y-1.5">
            <Label>Fuente legal</Label>
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
