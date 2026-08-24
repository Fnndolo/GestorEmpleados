'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarPlus, Plus, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  registrarVigenciaParametro, registrarVigenciaTipoHora, actualizarInterruptoresNomina,
} from './acciones'
import { FilaParametro, DialogNuevoParametro } from './fila-parametro'
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
  const [creando, setCreando] = useState(false)
  const [editandoHora, setEditandoHora] = useState<TipoHoraItem | null>(null)

  async function guardarInterruptores(retefuente: boolean, exonerada: boolean) {
    const res = await actualizarInterruptoresNomina({ aplicaRetefuente: retefuente, empresaExonerada: exonerada })
    if (res.ok) { toast.success('Configuración de nómina actualizada.'); router.refresh() }
    else toast.error(res.error)
  }

  return (
    <div className="space-y-6">
      {/* ── Interruptores ── */}
      <Card><CardContent className="space-y-4 py-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Aplicar retención en la fuente</p>
            <p className="text-xs text-muted-foreground">Procedimiento 1 (tabla art. 383 E.T.). Actívala si algún salario supera la base gravable.</p>
          </div>
          <Switch checked={aplicaRetefuente} disabled={!puedeEditar} onCheckedChange={(v) => guardarInterruptores(v, empresaExonerada)} />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Empresa exonerada (Ley 114-1)</p>
            <p className="text-xs text-muted-foreground">Sin aporte patronal de salud, SENA ni ICBF para salarios menores a 10 SMMLV.</p>
          </div>
          <Switch checked={empresaExonerada} disabled={!puedeEditar} onCheckedChange={(v) => guardarInterruptores(aplicaRetefuente, v)} />
        </div>
      </CardContent></Card>

      {/* ── Parámetros legales ── */}
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-[13px] font-bold">Parámetros legales</h2>
          {puedeEditar && (
            <Button size="sm" variant="outline" onClick={() => setCreando(true)}>
              <Plus className="size-4" /> Nuevo parámetro
            </Button>
          )}
        </div>
        <Card><CardContent className="divide-y p-0">
          {parametros.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No hay parámetros cargados. Sin el SMMLV la nómina no puede liquidar ni calcular una terminación.
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
        <h2 className="mb-2 text-[13px] font-bold">Horas extra y recargos (factores)</h2>
        <Card><CardContent className="divide-y p-0">
          {tiposHora.map((t) => (
            <div key={t.codigo} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t.codigo} · {t.nombre}</p>
                <p className="text-xs text-muted-foreground">vigente desde {t.desde}</p>
              </div>
              <p className="text-sm font-bold tabular-nums">{Math.round(t.factor * 100)}%</p>
              {puedeEditar && (
                <Button size="sm" variant="outline" onClick={() => setEditandoHora(t)}>
                  <CalendarPlus className="size-4" /> Nueva vigencia
                </Button>
              )}
            </div>
          ))}
        </CardContent></Card>
        <p className="mt-2 text-xs text-muted-foreground">
          Así se aplican los cambios de ley sin programación: p. ej. el recargo dominical sube a 100% el 1-jul-2027 (Ley 2466) — regístralo aquí con esa fecha y la nómina lo usará automáticamente.
        </p>
      </section>

      {creando && <DialogNuevoParametro onClose={() => setCreando(false)} onDone={() => { setCreando(false); router.refresh() }} />}
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
          <DialogDescription>
            La vigencia actual ({fmtValor(parametro.valor)}, desde {parametro.desde}) se cierra el día anterior y queda en el histórico para auditoría.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nuevo valor {esPorcentaje && <span className="text-xs text-muted-foreground">(decimal: 0.04 = 4%)</span>}</Label>
            <Input type="number" step="any" value={valor} onChange={(e) => setValor(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Rige desde</Label>
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Fuente legal (opcional)</Label>
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
          <DialogDescription>
            El factor actual ({Math.round(tipo.factor * 100)}%, desde {tipo.desde}) se cierra el día anterior; los periodos ya liquidados no cambian.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nuevo factor (%)</Label>
            <Input type="number" step="1" value={factor} onChange={(e) => setFactor(e.target.value)} />
            <p className="text-xs text-muted-foreground">Ejemplo: 25 = recargo del 25% sobre la hora ordinaria; 90 = recargo dominical 2026.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Rige desde</Label>
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
