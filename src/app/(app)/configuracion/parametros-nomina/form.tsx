'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarPlus, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Ayuda } from '@/components/ui-kit/ayuda'
import {
  registrarVigenciaParametro, registrarVigenciaTipoHora, actualizarInterruptoresNomina,
} from './acciones'
import { FilaParametro } from './fila-parametro'
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
export type TipoHoraItem = { codigo: string; nombre: string; factor: number; desde: string }


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
        </h2>
        <Card className="py-0"><CardContent className="divide-y p-0">
          {tiposHora.map((t) => (
            <div key={t.codigo} className="flex items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4">
              <div className="min-w-0 flex-1">
                <p className="flex min-w-0 items-center text-sm font-medium">
                  <span className="truncate">{t.codigo} · {t.nombre}</span>
                  <span className="ml-auto shrink-0 pl-2 font-bold tabular-nums">{Math.round(t.factor * 100)}%</span>
                </p>
                <p className="truncate text-xs text-muted-foreground">desde {t.desde}</p>
              </div>
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
          ))}
        </CardContent></Card>
      </section>

      {editando && <DialogVigenciaParametro parametro={editando} onClose={() => setEditando(null)} onDone={() => { setEditando(null); router.refresh() }} />}
      {editandoHora && <DialogVigenciaHora tipo={editandoHora} onClose={() => setEditandoHora(null)} onDone={() => { setEditandoHora(null); router.refresh() }} />}
    </div>
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
