'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { RefreshCw, Trash2, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { fmtCOP } from '@/lib/moneda'
import { recalcularLiquidacion, anularTerminacion } from '../acciones'

/**
 * Rehacer las cifras y anular una terminación registrada por error.
 *
 * Las dos existen porque el cálculo se congela al registrar la terminación: si
 * el salario del contrato estaba mal o la fecha de retiro se digitó mal, esas
 * cifras quedan falsas. Antes tocaba registrar otra terminación y dejar la mala
 * en la base.
 *
 * Ninguna aparece si la terminación ya está cerrada: ahí ya se pagó y se firmó
 * el paz y salvo, y corregir eso es una nota contable.
 */
export type BasesUsadas = {
  auxilioTransporte: number
  promedioVariableAnual: number
  promedioVariableSemestre: number
  otroConceptoSalarial: number
  diasSalarioPendiente: number
  periodosConsiderados: number
}

export type MesVentana = {
  mes: string
  etiqueta: string
  enSemestre: boolean
  valorConocido: number
}

export type Ventana = {
  meses: MesVentana[]
  /** Divisores de cada promedio: los MESES que abarca cada ventana. */
  mesesAnual: number
  mesesSemestre: number
}

/** Campos de ajuste: vacío significa "usa lo que calculó el sistema". */
type Ajustes = Partial<Record<'auxilioTransporte' | 'otroConceptoSalarial' | 'diasSalarioPendiente', string>>

export function AccionesLiquidacion({ terminacionId, colaborador, fechaRetiro, bases, ventana, variableGuardado, puedeEditar, puedeEliminar }: {
  terminacionId: string
  colaborador: string
  /** yyyy-mm-dd, para poder corregirla al recalcular. */
  fechaRetiro: string
  /** Bases con que se calculó, para precargarlas y poder corregirlas. */
  bases: BasesUsadas
  /** Meses sobre los que se promedia el variable. */
  ventana: Ventana
  /** Lo que ya se digitó antes, por mes, para no volver a escribirlo. */
  variableGuardado: Record<string, number>
  puedeEditar: boolean
  puedeEliminar: boolean
}) {
  const router = useRouter()
  const [dialogo, setDialogo] = useState<'recalcular' | 'anular' | null>(null)
  const [fecha, setFecha] = useState(fechaRetiro)
  const [motivo, setMotivo] = useState('')
  const [ajustes, setAjustes] = useState<Ajustes>({})
  const [variable, setVariable] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(variableGuardado).map(([k, v]) => [k, String(v)])),
  )
  const [g, setG] = useState(false)

  const periodosConsiderados = bases.periodosConsiderados
  const sinHistorial = periodosConsiderados === 0

  const setAjuste = (campo: keyof Ajustes, valor: string) => setAjustes((a) => ({ ...a, [campo]: valor }))

  // Los promedios se muestran mientras se digita, para que nadie tenga que
  // dividir nada ni adivinar qué va a salir.
  const meses = ventana.meses.map((m) => ({ ...m, valor: valorDe(variable[m.mes], m.valorConocido) }))
  const sumaAnual = meses.reduce((t, m) => t + m.valor, 0)
  const sumaSemestre = meses.filter((m) => m.enSemestre).reduce((t, m) => t + m.valor, 0)
  const promedioAnual = ventana.mesesAnual > 0 ? Math.round(sumaAnual / ventana.mesesAnual) : 0
  const promedioSemestre = ventana.mesesSemestre > 0 ? Math.round(sumaSemestre / ventana.mesesSemestre) : 0

  async function recalcular() {
    setG(true)
    // Un campo en blanco no es un cero: significa "deja lo que calculó el
    // sistema". Por eso se omite en lugar de mandarse, y solo viajan los que
    // alguien digitó de verdad.
    const variablePorMes = Object.entries(variable)
      .map(([mes, v]) => ({ mes, valor: Number(v) }))
      .filter((m) => v_valido(m.valor) && ventana.meses.some((x) => x.mes === m.mes))

    const res = await recalcularLiquidacion({
      id: terminacionId,
      fechaRetiro: fecha,
      ...numero('auxilioTransporte', ajustes.auxilioTransporte),
      ...numero('otroConceptoSalarial', ajustes.otroConceptoSalarial),
      ...numero('diasSalarioPendiente', ajustes.diasSalarioPendiente),
      ...(variablePorMes.length > 0 ? { variablePorMes } : {}),
    })
    setG(false)
    if (res.ok) {
      toast.success('Liquidación rehecha con los datos actuales.')
      setDialogo(null)
      router.refresh()
    } else toast.error(res.error)
  }

  async function anular() {
    if (motivo.trim().length < 5) { toast.error('Explica por qué se anula.'); return }
    setG(true)
    const res = await anularTerminacion({ id: terminacionId, motivo })
    setG(false)
    if (res.ok) {
      toast.success('Terminación anulada. El colaborador vuelve a estar activo.')
      router.push('/terminaciones')
    } else toast.error(res.error)
  }

  if (!puedeEditar && !puedeEliminar) return null

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {puedeEditar && (
          <Button size="sm" variant="outline" onClick={() => { setFecha(fechaRetiro); setDialogo('recalcular') }}>
            <RefreshCw className="size-4" /> Rehacer el cálculo
          </Button>
        )}
        {puedeEliminar && (
          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => { setMotivo(''); setDialogo('anular') }}>
            <Trash2 className="size-4" /> Anular
          </Button>
        )}
      </div>

      <Dialog open={dialogo === 'recalcular'} onOpenChange={(o) => { if (!g && !o) setDialogo(null) }}>
        <DialogContent className="max-h-[88vh] w-[min(96vw,560px)] overflow-y-auto sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Rehacer el cálculo</DialogTitle>
            <DialogDescription>
              Se vuelven a calcular cesantías, prima, vacaciones e indemnización con los datos que
              hay hoy: el salario del contrato, los préstamos pendientes y el saldo de vacaciones.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="fecha-recalc">Fecha de retiro</Label>
            <Input id="fecha-recalc" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              De ella salen los días liquidados. Si se digitó mal, corrígela aquí.
            </p>
          </div>

          {/* Bases del año en curso. Se derivan de los desprendibles emitidos por
              el sistema; cuando la empresa venía liquidando en otro software no
              hay de dónde sacarlas y toca digitarlas del corte de la migración. */}
          <details className="rounded-lg border" open={sinHistorial}>
            <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium">
              Bases del año en curso
              {sinHistorial && <span className="ml-2 font-normal text-amber-600 dark:text-amber-400">· sin nóminas previas</span>}
            </summary>
            <div className="space-y-3 border-t p-3">
              <p className="text-xs text-muted-foreground">
                {sinHistorial
                  ? 'No hay desprendibles anteriores en el sistema, así que los promedios salen en cero. Digítalos del último cierre del software con que se venía liquidando.'
                  : `Calculadas con ${periodosConsiderados} ${periodosConsiderados === 1 ? 'desprendible emitido' : 'desprendibles emitidos'}. Solo digita algo si necesitas corregirlas.`}
              </p>
              {/* Se pide el pago mes a mes, que es el dato que el contador tiene
                  en su registro. Pedirle el promedio sería pedirle que haga la
                  división, y ahí es donde entran los errores. */}
              <div>
                <p className="mb-2 text-xs font-medium">Comisiones y horas extra pagadas cada mes</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {ventana.meses.map((m) => (
                    <div key={m.mes} className="flex items-center gap-2">
                      <label htmlFor={`mes-${m.mes}`} className="w-20 shrink-0 text-xs text-muted-foreground">
                        {m.etiqueta}
                      </label>
                      <Input
                        id={`mes-${m.mes}`}
                        type="number" min="0" inputMode="decimal" className="h-8"
                        value={variable[m.mes] ?? ''}
                        onChange={(e) => setVariable((v) => ({ ...v, [m.mes]: e.target.value }))}
                        placeholder={m.valorConocido > 0 ? fmtCOP(m.valorConocido) : '0'}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-3 space-y-1 rounded-md bg-muted/60 px-3 py-2 text-xs">
                  <Calculado
                    k="Promedio del año" v={promedioAnual}
                    detalle={`${fmtCOP(sumaAnual)} ÷ ${ventana.mesesAnual.toFixed(2)} meses`}
                    para="base de cesantías"
                  />
                  <Calculado
                    k="Promedio del semestre" v={promedioSemestre}
                    detalle={`${fmtCOP(sumaSemestre)} ÷ ${ventana.mesesSemestre.toFixed(2)} meses`}
                    para="base de prima"
                  />
                </div>
              </div>

              <div className="grid gap-3 border-t pt-3 sm:grid-cols-2">
                <CampoBase
                  id="otro-sal" label="Otro concepto salarial"
                  ayuda="Comisiones y horas del último tramo, sin pagar"
                  valor={ajustes.otroConceptoSalarial} onChange={(v) => setAjuste('otroConceptoSalarial', v)}
                  sugerido={bases.otroConceptoSalarial}
                />
                <CampoBase
                  id="aux-tte" label="Auxilio de transporte"
                  ayuda="Valor mensual; 0 si no le corresponde"
                  valor={ajustes.auxilioTransporte} onChange={(v) => setAjuste('auxilioTransporte', v)}
                  sugerido={bases.auxilioTransporte}
                />
                <CampoBase
                  id="dias-sal" label="Días de salario pendientes"
                  ayuda="Del último mes, sin pagar por nómina"
                  valor={ajustes.diasSalarioPendiente} onChange={(v) => setAjuste('diasSalarioPendiente', v)}
                  sugerido={bases.diasSalarioPendiente} moneda={false}
                />
              </div>
            </div>
          </details>

          <DialogFooter>
            <Button variant="ghost" disabled={g} onClick={() => setDialogo(null)}>Cancelar</Button>
            <Button onClick={recalcular} disabled={g}>{g ? <Spinner /> : <RefreshCw className="size-4" />} Rehacer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogo === 'anular'} onOpenChange={(o) => { if (!g && !o) setDialogo(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anular la terminación</DialogTitle>
            <DialogDescription>
              Para cuando se registró por error. <b>{colaborador}</b> vuelve a estar activo y se
              podrá registrar la terminación correcta.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-300">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <p>
              Se eliminan también la liquidación y el paz y salvo de esta terminación. El motivo que
              escribas queda en la auditoría.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="motivo-anular">Motivo</Label>
            <Textarea
              id="motivo-anular" rows={3} value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: se registró con la fecha de retiro equivocada"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" disabled={g} onClick={() => setDialogo(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={anular} disabled={g}>{g ? <Spinner /> : <Trash2 className="size-4" />} Anular</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * Campo de una base prestacional. Vacío = usar lo que calculó el sistema, que se
 * muestra como marcador de posición para saber contra qué se está corrigiendo.
 */
function CampoBase({ id, label, ayuda, valor, onChange, sugerido, moneda = true }: {
  id: string
  label: string
  ayuda: string
  valor: string | undefined
  onChange: (v: string) => void
  sugerido: number
  moneda?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <Input
        id={id}
        type="number"
        min="0"
        inputMode="decimal"
        value={valor ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={moneda ? fmtCOP(sugerido) : String(sugerido)}
      />
      <p className="text-[11px] leading-tight text-muted-foreground">{ayuda}</p>
    </div>
  )
}

/** Campo digitado → propiedad con número; en blanco o inválido → nada. */
function numero<K extends string>(campo: K, valor: string | undefined): Partial<Record<K, number>> {
  if (valor == null || valor.trim() === '') return {}
  const n = Number(valor)
  return Number.isFinite(n) && n >= 0 ? ({ [campo]: n } as Record<K, number>) : {}
}

/** Lo digitado, o lo que el sistema ya sabía si el campo está en blanco. */
function valorDe(digitado: string | undefined, conocido: number): number {
  if (digitado == null || digitado.trim() === '') return conocido
  const n = Number(digitado)
  return Number.isFinite(n) && n >= 0 ? n : conocido
}

const v_valido = (n: number) => Number.isFinite(n) && n >= 0

/** Promedio que sale de los meses digitados, con la división a la vista. */
function Calculado({ k, v, detalle, para }: { k: string; v: number; detalle: string; para: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-2">
      <span className="text-muted-foreground">
        {k} <span className="hidden sm:inline">· {para}</span>
      </span>
      <span className="tabular-nums">
        <span className="text-muted-foreground">{detalle} = </span>
        <span className="font-medium">{fmtCOP(v)}</span>
      </span>
    </div>
  )
}
