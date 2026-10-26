'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarPlus, ChevronRight, Pencil, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Ayuda } from '@/components/ui-kit/ayuda'
import { BotonAgregar } from '@/components/ui-kit/boton-agregar'
import { BotonEliminar } from '@/components/ui-kit/boton-eliminar'
import { cn } from '@/lib/utils'
import {
  registrarVigenciaParametro, registrarVigenciaTipoHora, actualizarInterruptoresNomina,
  crearTipoHora, editarVigenciaTipoHora, eliminarVigenciaTipoHora,
} from './acciones'
import { FilaParametro } from './fila-parametro'
import { DialogMotivo } from '../dialog-motivo'
import { fmtValor } from './formato'

export type VigenciaItem = {
  id: string; valor: number; desde: string; hasta: string | null; fuente: string
  /** PDF del decreto o resolución que sustenta el valor, si se adjuntó. */
  soporte: { id: string; nombre: string } | null
}
export type ParametroItem = {
  clave: string; id: string; valor: number; desde: string; fuente: string
  descripcion: string | null; vigente: boolean
  /** Lo lee el motor de nómina: no se puede eliminar. */
  delMotor: boolean
  /** Todas sus vigencias, de la más reciente a la más antigua. */
  historial: VigenciaItem[]
}
export type VigenciaHoraItem = { id: string; factor: number; desde: string; hasta: string | null }
export type TipoHoraItem = {
  codigo: string; nombre: string; factor: number; desde: string
  /** Lo lee el motor de nómina: no puede quedarse sin vigencias. */
  delMotor: boolean
  /** Todas sus vigencias, de la más reciente a la más antigua. */
  historial: VigenciaHoraItem[]
}


export function ParametrosForm({ puedeEditar, parametros, tiposHora, aplicaRetefuente, empresaExonerada }: {
  puedeEditar: boolean
  parametros: ParametroItem[]
  tiposHora: TipoHoraItem[]
  aplicaRetefuente: boolean
  empresaExonerada: boolean
}) {
  const router = useRouter()
  const [editando, setEditando] = useState<ParametroItem | null>(null)
  const [editandoHora, setEditandoHora] = useState<TipoHoraItem | null>(null)
  const [nuevoTipo, setNuevoTipo] = useState(false)
  const [corrigiendoHora, setCorrigiendoHora] = useState<{ tipo: TipoHoraItem; v: VigenciaHoraItem } | null>(null)
  const [borrandoHora, setBorrandoHora] = useState<{ tipo: TipoHoraItem; v: VigenciaHoraItem } | null>(null)
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({})

  async function guardarInterruptores(retefuente: boolean, exonerada: boolean) {
    const res = await actualizarInterruptoresNomina({ aplicaRetefuente: retefuente, empresaExonerada: exonerada })
    if (res.ok) { toast.success('Configuración de nómina actualizada.'); router.refresh() }
    else toast.error(res.error)
  }

  return (
    <div className="space-y-6">
      {/* ── Interruptores: el rótulo a la vista y su explicación legal en el ⓘ ── */}
      <Card className="py-0"><CardContent className="divide-y px-3 sm:px-4">
        <div className="flex items-center justify-between gap-3 py-3">
          <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
            <span className="truncate">Aplicar retención en la fuente</span>
            <Ayuda
              texto="Procedimiento 1 (tabla art. 383 E.T.). Actívala si algún salario supera la base gravable."
              etiqueta="Sobre la retención en la fuente"
            />
          </p>
          <Switch checked={aplicaRetefuente} disabled={!puedeEditar} onCheckedChange={(v) => guardarInterruptores(v, empresaExonerada)} aria-label="Aplicar retención en la fuente" />
        </div>
        <div className="flex items-center justify-between gap-3 py-3">
          <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
            <span className="truncate">Empresa exonerada</span>
            <Ayuda
              texto="Ley 114-1: sin aporte patronal de salud, SENA ni ICBF para salarios menores a 10 SMMLV."
              etiqueta="Sobre la empresa exonerada"
            />
          </p>
          <Switch checked={empresaExonerada} disabled={!puedeEditar} onCheckedChange={(v) => guardarInterruptores(aplicaRetefuente, v)} aria-label="Empresa exonerada" />
        </div>
      </CardContent></Card>

      {/* ── Parámetros legales (el + para crear uno va en el encabezado) ── */}
      <section>
        <h2 className="mb-2 text-[13px] font-bold">Parámetros legales</h2>
        <Card className="py-0"><CardContent className="divide-y p-0">
          {parametros.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No hay parámetros: sin el SMMLV la nómina no puede liquidar.
            </p>
          )}
          {parametros.map((p) => (
            <FilaParametro
              key={p.clave}
              p={p}
              puedeEditar={puedeEditar}
              onNuevaVigencia={() => setEditando(p)}
              onCambio={() => router.refresh()}
            />
          ))}
        </CardContent></Card>
      </section>

      {/* ── Tipos de hora ── */}
      <section>
        <h2 className="mb-2 flex items-center gap-1.5 text-[13px] font-bold">
          Horas extra y recargos
          <Ayuda
            texto="Factores sobre la hora ordinaria. Así se aplican los cambios de ley sin programación: p. ej. el recargo dominical sube a 100% el 1-jul-2027 (Ley 2466) — regístralo aquí con esa fecha y la nómina lo usará automáticamente."
            etiqueta="Sobre las horas extra y recargos"
          />
          {puedeEditar && <BotonAgregar etiqueta="Nuevo tipo de hora" className="ml-auto" onClick={() => setNuevoTipo(true)} />}
        </h2>
        <Card className="py-0"><CardContent className="divide-y p-0">
          {tiposHora.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No hay tipos de hora: sin ellos las horas extra no se liquidan.</p>
          )}
          {tiposHora.map((t) => {
            const abierto = !!abiertos[t.codigo]
            return (
              <div key={t.codigo} className="px-3 py-2.5 sm:px-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  {/* Al desplegar, cada vigencia con su lápiz y su papelera. */}
                  <button type="button" onClick={() => setAbiertos((a) => ({ ...a, [t.codigo]: !abierto }))} className="min-w-0 flex-1 text-left" aria-expanded={abierto}>
                    <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                      <ChevronRight className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', abierto && 'rotate-90')} />
                      <span className="truncate">{t.codigo} · {t.nombre}</span>
                      <span className="ml-auto shrink-0 pl-2 font-bold tabular-nums">{Math.round(t.factor * 100)}%</span>
                    </span>
                    <span className="block truncate pl-5 text-xs text-muted-foreground">
                      desde {t.desde}{t.historial.length > 1 ? ` · ${t.historial.length} vigencias` : ''}
                    </span>
                  </button>
                  {puedeEditar && (
                    <Button
                      size="sm" variant="outline" className="max-sm:size-8 max-sm:px-0"
                      onClick={() => setEditandoHora(t)}
                      aria-label={`Nueva vigencia de ${t.codigo}`} title="Nueva vigencia"
                    >
                      <CalendarPlus className="size-4" /> <span className="max-sm:sr-only">Nueva vigencia</span>
                    </Button>
                  )}
                </div>
                {abierto && (
                  <ul className="mt-2 space-y-1.5 border-l pl-5">
                    {t.historial.map((v) => (
                      <li key={v.id} className="flex items-center gap-1 text-xs">
                        <p className="min-w-0 flex-1 truncate tabular-nums">
                          <span className="font-medium">{Math.round(v.factor * 100)}%</span>
                          <span className="text-muted-foreground"> · {v.desde} → {v.hasta ?? 'vigente'}</span>
                        </p>
                        {puedeEditar && (
                          <>
                            <Button size="icon" variant="ghost" className="size-7 shrink-0" onClick={() => setCorrigiendoHora({ tipo: t, v })} aria-label={`Corregir la vigencia desde ${v.desde}`} title="Corregir esta vigencia">
                              <Pencil className="size-3.5" />
                            </Button>
                            <BotonEliminar
                              onEliminar={() => setBorrandoHora({ tipo: t, v })}
                              etiqueta={`Eliminar la vigencia desde ${v.desde}`}
                              motivoBloqueo={t.delMotor && t.historial.length === 1
                                ? `${t.codigo} lo usa el motor de nómina: no puede quedarse sin ninguna vigencia. Registra el factor correcto y luego borra el equivocado.`
                                : null}
                            />
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </CardContent></Card>
      </section>

      {editando && <DialogVigenciaParametro parametro={editando} onClose={() => setEditando(null)} onDone={() => { setEditando(null); router.refresh() }} />}
      {editandoHora && <DialogVigenciaHora tipo={editandoHora} onClose={() => setEditandoHora(null)} onDone={() => { setEditandoHora(null); router.refresh() }} />}
      {nuevoTipo && <DialogNuevoTipoHora onClose={() => setNuevoTipo(false)} onDone={() => { setNuevoTipo(false); router.refresh() }} />}
      {corrigiendoHora && (
        <DialogCorregirVigenciaHora
          tipo={corrigiendoHora.tipo} vigencia={corrigiendoHora.v}
          onClose={() => setCorrigiendoHora(null)} onDone={() => { setCorrigiendoHora(null); router.refresh() }}
        />
      )}
      {borrandoHora && (
        <DialogMotivo
          titulo={`Eliminar vigencia de ${borrandoHora.tipo.codigo}`}
          resumen={`${Math.round(borrandoHora.v.factor * 100)}% · ${borrandoHora.v.desde} → ${borrandoHora.v.hasta ?? 'vigente'}. Si era la última, vuelve a regir la anterior.`}
          placeholder="¿Por qué se elimina?"
          onClose={() => setBorrandoHora(null)}
          onConfirmar={async (motivo) => {
            const res = await eliminarVigenciaTipoHora({ id: borrandoHora.v.id, motivo })
            if (res.ok) { toast.success('Vigencia eliminada.'); router.refresh(); return true }
            toast.error(res.error, { duration: 8000 })
            return false
          }}
        />
      )}
    </div>
  )
}

/** Un tipo de hora que no existía: un recargo propio o uno de ley que falte. */
function DialogNuevoTipoHora({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [codigo, setCodigo] = useState('')
  const [nombre, setNombre] = useState('')
  const [factor, setFactor] = useState('')
  const [desde, setDesde] = useState('')
  const [g, setG] = useState(false)

  async function guardar() {
    setG(true)
    const res = await crearTipoHora({ codigo: codigo.trim().toUpperCase(), nombre, factor: Number(factor) / 100, vigenteDesde: desde })
    setG(false)
    if (res.ok) { toast.success(`Tipo de hora ${codigo.toUpperCase()} creado.`); onDone() }
    else toast.error(res.error, { duration: 8000 })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !g && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo tipo de hora</DialogTitle>
          <DialogDescription>Si el código ya existe, registra una nueva vigencia.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="gap-1.5">
                Código <span className="text-destructive">*</span>
                <Ayuda texto="En MAYÚSCULAS. El motor de nómina lee HED, HEN, RN, RD, RND, HEDD y HEND por este código exacto; uno inventado queda como referencia." etiqueta="Sobre el código" />
              </Label>
              <Input value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="HED" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>Factor (%) <span className="text-destructive">*</span></Label>
              <Input type="number" step="1" value={factor} onChange={(e) => setFactor(e.target.value)} placeholder="25" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Nombre <span className="text-destructive">*</span></Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Hora extra diurna" />
          </div>
          <div className="space-y-1.5">
            <Label>Rige desde <span className="text-destructive">*</span></Label>
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={g}>Cancelar</Button>
          <Button onClick={guardar} disabled={g || codigo.trim().length < 2 || nombre.trim().length < 3 || factor === '' || !desde}>{g ? <Spinner /> : <Save className="size-4" />} Crear</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Corrige la fila mal digitada: factor y desde cuándo rige (si ninguna nómina cerrada la usó). */
function DialogCorregirVigenciaHora({ tipo, vigencia, onClose, onDone }: { tipo: TipoHoraItem; vigencia: VigenciaHoraItem; onClose: () => void; onDone: () => void }) {
  const [factor, setFactor] = useState(String(Math.round(vigencia.factor * 100)))
  const [desde, setDesde] = useState(vigencia.desde)
  const [g, setG] = useState(false)

  async function guardar() {
    setG(true)
    const res = await editarVigenciaTipoHora({ id: vigencia.id, factor: Number(factor) / 100, vigenteDesde: desde })
    setG(false)
    if (res.ok) { toast.success('Vigencia corregida.'); onDone() }
    else toast.error(res.error, { duration: 8000 })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !g && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Corregir vigencia — {tipo.codigo}</DialogTitle>
          <DialogDescription>{vigencia.desde} → {vigencia.hasta ?? 'vigente'}. Para un cambio de ley usa «Nueva vigencia»: esto corrige lo que quedó mal digitado.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Factor (%) <span className="text-destructive">*</span></Label>
            <Input type="number" step="1" value={factor} onChange={(e) => setFactor(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label className="gap-1.5">
              Rige desde <span className="text-destructive">*</span>
              <Ayuda texto="Si la mueves, la vigencia anterior se cierra el día antes para que no quede hueco." etiqueta="Qué pasa al mover la fecha" />
            </Label>
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={g}>Cancelar</Button>
          <Button onClick={guardar} disabled={g || factor === '' || !desde}>{g ? <Spinner /> : <Save className="size-4" />} Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DialogVigenciaParametro({ parametro, onClose, onDone }: { parametro: ParametroItem; onClose: () => void; onDone: () => void }) {
  const [valor, setValor] = useState(String(parametro.valor))
  const [desde, setDesde] = useState('')
  const [fuente, setFuente] = useState('')
  const [g, setG] = useState(false)
  const esPorcentaje = parametro.valor <= 1

  async function guardar() {
    if (!desde) { toast.error('Indica desde cuándo rige el nuevo valor.'); return }
    setG(true)
    const res = await registrarVigenciaParametro({
      clave: parametro.clave, valor: Number(valor), vigenciaDesde: desde, fuenteLegal: fuente || undefined,
    })
    setG(false)
    if (res.ok) { toast.success(`Nueva vigencia de ${parametro.clave} registrada.`); onDone() }
    else toast.error(res.error)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva vigencia — {parametro.clave}</DialogTitle>
          <DialogDescription>Actual: {fmtValor(parametro.valor)}, desde {parametro.desde}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="gap-1.5">
              Nuevo valor <span className="text-destructive">*</span>
              {esPorcentaje && <Ayuda texto="Porcentaje en decimal: 0.04 = 4%." etiqueta="Cómo escribir el valor" />}
            </Label>
            {/* autoFocus: si no, el diálogo enfoca el ⓘ (va antes) y abre su texto encima del título. */}
            <Input type="number" step="any" value={valor} onChange={(e) => setValor(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label className="gap-1.5">
              Rige desde <span className="text-destructive">*</span>
              <Ayuda
                texto="La vigencia actual se cierra el día anterior y queda en el histórico para auditoría."
                etiqueta="Qué pasa con la vigencia actual"
              />
            </Label>
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Fuente legal</Label>
            <Textarea rows={2} placeholder="Decreto, ley o resolución que sustenta el cambio" value={fuente} onChange={(e) => setFuente(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={g}>{g ? <Spinner /> : <Save className="size-4" />} Registrar vigencia</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DialogVigenciaHora({ tipo, onClose, onDone }: { tipo: TipoHoraItem; onClose: () => void; onDone: () => void }) {
  const [factor, setFactor] = useState(String(Math.round(tipo.factor * 100)))
  const [desde, setDesde] = useState('')
  const [g, setG] = useState(false)

  async function guardar() {
    if (!desde) { toast.error('Indica desde cuándo rige el nuevo factor.'); return }
    setG(true)
    const res = await registrarVigenciaTipoHora({
      codigo: tipo.codigo as 'HED', factor: Number(factor) / 100, vigenteDesde: desde,
    })
    setG(false)
    if (res.ok) { toast.success(`Nuevo factor de ${tipo.codigo} registrado.`); onDone() }
    else toast.error(res.error)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva vigencia — {tipo.codigo} ({tipo.nombre})</DialogTitle>
          <DialogDescription>Actual: {Math.round(tipo.factor * 100)}%, desde {tipo.desde}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="gap-1.5">
              Nuevo factor (%) <span className="text-destructive">*</span>
              <Ayuda
                texto="Ejemplo: 25 = recargo del 25% sobre la hora ordinaria; 90 = recargo dominical 2026."
                etiqueta="Cómo escribir el factor"
              />
            </Label>
            <Input type="number" step="1" value={factor} onChange={(e) => setFactor(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label className="gap-1.5">
              Rige desde <span className="text-destructive">*</span>
              <Ayuda
                texto="El factor actual se cierra el día anterior; los periodos ya liquidados no cambian."
                etiqueta="Qué pasa con el factor actual"
              />
            </Label>
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={g}>{g ? <Spinner /> : <Save className="size-4" />} Registrar vigencia</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
