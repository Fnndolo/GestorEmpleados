'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Timer, RefreshCw, Download, KeyRound, Eye, EyeOff, Unplug } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { Chip, Pill, type PillTone } from '@/components/ui-kit'
import { fmtCOP } from '@/lib/moneda'
import {
  consultarHorasAsistencia, traerHorasAsistencia, conectarAsistencia, desconectarAsistencia, type ResumenPantalla,
} from './asistencia-acciones'

/**
 * Las horas extra del período tal como las calcula AsistencIA (control de
 * asistencia), cruzadas por cédula con las fichas de aquí. Desde este panel se
 * conecta la clave de la empresa, se revisa cada período y se traen las horas
 * como novedades pendientes para que la nómina las recoja.
 */

const CODIGOS = ['HED', 'HEN', 'HEDDF', 'HENDF'] as const
const ETIQUETA: Record<string, string> = { HED: 'Diurna', HEN: 'Nocturna', HEDDF: 'Dom/fest. diurna', HENDF: 'Dom/fest. nocturna' }
const PAGO: Record<string, { texto: string; tone: PillTone }> = {
  pendiente: { texto: 'Pendiente', tone: 'warn' }, parcial: { texto: 'Parcial', tone: 'info' }, pagado: { texto: 'Pagada', tone: 'ok' },
}
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

const horas = (n: number) => (n ? `${n.toLocaleString('es-CO', { maximumFractionDigits: 2 })} h` : '—')

/** Los últimos doce meses, del más reciente al más antiguo, como AAAA-MM. */
function mesesRecientes(hoy: string): { valor: string; etiqueta: string }[] {
  const [a, m] = hoy.split('-').map(Number)
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(a, m - 1 - i, 1))
    const valor = d.toISOString().slice(0, 7)
    const etiqueta = `${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`
    return { valor, etiqueta: etiqueta[0].toUpperCase() + etiqueta.slice(1) }
  })
}

export function PanelAsistencia({ conectada, url, puedeConfigurar, hoy }: {
  conectada: boolean; url: string | null; puedeConfigurar: boolean; hoy: string
}) {
  const router = useRouter()
  const meses = mesesRecientes(hoy)
  const [mes, setMes] = useState(hoy.slice(0, 7))
  // La quincena en curso: hasta el 15 la primera, después la segunda.
  const [quincena, setQuincena] = useState<1 | 2 | null>(Number(hoy.slice(8, 10)) <= 15 ? 1 : 2)
  const [trayendo, setTrayendo] = useState(false)
  const [conectar, setConectar] = useState(false)
  const [version, setVersion] = useState(0)
  // La respuesta lleva la clave del período que la pidió: si no coincide con
  // el período elegido, es que todavía se está consultando.
  const clave = `${mes}|${quincena}|${version}`
  const [respuesta, setRespuesta] = useState<{ clave: string; datos: ResumenPantalla | null; error: string | null } | null>(null)

  useEffect(() => {
    if (!conectada) return
    let vigente = true
    consultarHorasAsistencia({ mes, quincena }).then((res) => {
      if (!vigente) return
      setRespuesta({ clave, datos: res.ok ? res.datos : null, error: res.ok ? null : res.error })
    })
    return () => { vigente = false }
  }, [conectada, mes, quincena, clave])

  const cargando = conectada && respuesta?.clave !== clave
  const datos = respuesta?.datos ?? null
  const error = respuesta?.error ?? null

  async function traer() {
    setTrayendo(true)
    const res = await traerHorasAsistencia({ mes, quincena })
    setTrayendo(false)
    if (!res.ok) { toast.error(res.error, { duration: 8000 }); return }
    const r = res.datos
    const partes = [
      `${r.creadas} nueva${r.creadas === 1 ? '' : 's'}`,
      r.yaEstaban ? `${r.yaEstaban} ya estaba${r.yaEstaban === 1 ? '' : 'n'}` : null,
      r.quitadas ? `${r.quitadas} retirada${r.quitadas === 1 ? '' : 's'} (marcaciones corregidas)` : null,
    ].filter(Boolean)
    toast.success(`Horas traídas: ${partes.join(' · ')}.`)
    if (r.sinColaborador.length) {
      toast.warning(
        `${r.sinColaborador.length} cédula(s) de AsistencIA no tienen ficha activa aquí: ${r.sinColaborador.map((s) => s.nombre ?? s.documento).join(', ')}.`,
        { duration: 10000 },
      )
    }
    setVersion((v) => v + 1)
    router.refresh()
  }

  const t = datos?.totales

  return (
    <>
      <Card className="mb-3">
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Chip icono={Timer} color="bg-foreground text-background" className="size-9 rounded-[10px]" iconClassName="size-[18px]" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">AsistencIA</p>
              <p className="truncate text-xs text-muted-foreground">
                {conectada ? 'Horas extra calculadas de las marcaciones.' : 'Control de asistencia sin conectar.'}
              </p>
            </div>
            <Pill tone={conectada ? 'ok' : 'warn'}>{conectada ? 'Conectada' : 'Sin conectar'}</Pill>
            {puedeConfigurar && (
              <Button size="icon" onClick={() => setConectar(true)} aria-label={conectada ? 'Cambiar la clave de API' : 'Conectar'} title={conectada ? 'Cambiar la clave de API' : 'Conectar'}>
                <KeyRound className="size-4" />
              </Button>
            )}
          </div>

          {!conectada ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {puedeConfigurar
                  ? 'Pega la clave de API de la empresa (en AsistencIA: Ajustes → Mi empresa → Clave de API) para ver aquí las horas extra de cada período y traerlas a la nómina.'
                  : 'Pide al administrador que conecte la clave de API de AsistencIA.'}
              </p>
              {puedeConfigurar && (
                <Button size="sm" onClick={() => setConectar(true)}><KeyRound className="size-4" /> Conectar</Button>
              )}
            </div>
          ) : (
            <>
              {/* El período de pago, como lo liquida nómina: mes y quincena. */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Select value={mes} onValueChange={setMes}>
                  <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{meses.map((m) => <SelectItem key={m.valor} value={m.valor}>{m.etiqueta}</SelectItem>)}</SelectContent>
                </Select>
                <div className="flex gap-1.5">
                  {([[1, '1 – 15'], [2, '16 – fin'], [null, 'Todo el mes']] as const).map(([q, l]) => (
                    <button
                      key={String(q)}
                      type="button"
                      onClick={() => setQuincena(q)}
                      className={cn(
                        'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
                        quincena === q ? 'bg-foreground text-background' : 'border bg-card text-muted-foreground hover:bg-accent',
                      )}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <div className="ml-auto flex gap-2">
                  <Button size="icon" onClick={() => setVersion((v) => v + 1)} disabled={cargando} aria-label="Actualizar" title="Volver a consultar">
                    {cargando ? <Spinner /> : <RefreshCw className="size-4" />}
                  </Button>
                  <Button size="sm" onClick={traer} disabled={trayendo || cargando || !datos || datos.filas.length === 0}>
                    {trayendo ? <Spinner /> : <Download className="size-4" />} Traer a la nómina
                  </Button>
                </div>
              </div>

              {error && <p className="mt-3 rounded-lg border border-dashed p-3 text-sm text-rose-700 dark:text-rose-400">{error}</p>}

              {datos && !error && (
                datos.filas.length === 0 ? (
                  <p className="mt-3 py-4 text-center text-sm text-muted-foreground">Sin horas extra del {datos.desde} al {datos.hasta}.</p>
                ) : (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead>
                        <tr className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                          <th className="py-1.5 pr-2 text-left font-bold">Empleado</th>
                          {CODIGOS.map((c) => <th key={c} className="py-1.5 px-2 text-right font-bold" title={ETIQUETA[c]}>{c}</th>)}
                          <th className="py-1.5 px-2 text-right font-bold">Total</th>
                          <th className="py-1.5 px-2 text-right font-bold">Valor</th>
                          <th className="py-1.5 pl-2 text-right font-bold">Pago</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {datos.filas.map((f) => (
                          <tr key={f.documento} className="align-middle">
                            <td className="py-2 pr-2">
                              <p className="font-semibold">{f.nombre}</p>
                              <p className="text-xs text-muted-foreground">
                                {f.documento}{f.sede ? ` · ${f.sede}` : ''}
                                {f.colaboradorId
                                  ? ` · ${f.registrados}/${f.tramos} en nómina${f.periodos.length ? ` (${f.periodos.join(', ')})` : ''}`
                                  : ''}
                              </p>
                              {!f.colaboradorId && <Pill tone="bad" className="mt-1">Sin ficha activa aquí</Pill>}
                            </td>
                            {CODIGOS.map((c) => (
                              <td key={c} className={cn('py-2 px-2 text-right tabular-nums', f.horas[c] ? 'font-semibold' : 'text-muted-foreground')}>{horas(f.horas[c])}</td>
                            ))}
                            <td className="py-2 px-2 text-right tabular-nums">{horas(f.horasExtra)}</td>
                            <td className="py-2 px-2 text-right font-semibold tabular-nums">{f.valor == null ? <span className="font-normal text-muted-foreground" title="Sin salario en AsistencIA">—</span> : fmtCOP(f.valor)}</td>
                            <td className="py-2 pl-2 text-right"><Pill tone={PAGO[f.pago].tone}>{PAGO[f.pago].texto}</Pill></td>
                          </tr>
                        ))}
                      </tbody>
                      {t && (
                        <tfoot>
                          <tr className="border-t font-bold">
                            <td className="py-2 pr-2">Total · {datos.filas.length} persona{datos.filas.length === 1 ? '' : 's'}</td>
                            {CODIGOS.map((c) => <td key={c} className="py-2 px-2 text-right tabular-nums">{horas(t.horas[c] ?? 0)}</td>)}
                            <td className="py-2 px-2 text-right tabular-nums">{horas(t.horasExtra)}</td>
                            <td className="py-2 px-2 text-right tabular-nums">{fmtCOP(t.valor)}</td>
                            <td />
                          </tr>
                        </tfoot>
                      )}
                    </table>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Valor según el salario registrado en AsistencIA{t && t.sinSalario ? ` (${t.sinSalario} sin salario allá)` : ''}; la nómina liquida con el salario y los factores de esta plataforma.
                      {datos.sinFicha > 0 && ` ${datos.sinFicha} cédula(s) no tienen ficha activa aquí: revísalas antes de traer.`}
                    </p>
                  </div>
                )
              )}
            </>
          )}
        </CardContent>
      </Card>

      {conectar && (
        <DialogConectar conectada={conectada} url={url} onClose={() => setConectar(false)} onDone={() => { setConectar(false); router.refresh() }} />
      )}
    </>
  )
}

function DialogConectar({ conectada, url, onClose, onDone }: { conectada: boolean; url: string | null; onClose: () => void; onDone: () => void }) {
  const [clave, setClave] = useState('')
  const [ver, setVer] = useState(false)
  const [otraUrl, setOtraUrl] = useState(false)
  const [urlPropia, setUrlPropia] = useState(url && !url.includes('arrivecontrol.vercel.app') ? url : '')
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    if (clave.trim().length < 8) { toast.error('Pega la clave completa.'); return }
    setGuardando(true)
    const res = await conectarAsistencia({ clave: clave.trim(), url: otraUrl ? urlPropia.trim() : '' })
    setGuardando(false)
    if (!res.ok) { toast.error(res.error, { duration: 8000 }); return }
    toast.success('AsistencIA conectada.')
    onDone()
  }

  async function desconectar() {
    if (!confirm('¿Desconectar AsistencIA? La nómina liquidará sin horas de marcaciones hasta que vuelvas a conectarla.')) return
    setGuardando(true)
    const res = await desconectarAsistencia({})
    setGuardando(false)
    if (!res.ok) { toast.error(res.error); return }
    toast.success('AsistencIA desconectada.')
    onDone()
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{conectada ? 'Cambiar la clave de AsistencIA' : 'Conectar AsistencIA'}</DialogTitle>
          <DialogDescription>En AsistencIA: Ajustes → Mi empresa → Clave de API. Cópiala y pégala aquí; se prueba antes de guardarla.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="asist-clave">Clave de API</Label>
            <div className="flex gap-2">
              <Input id="asist-clave" type={ver ? 'text' : 'password'} value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="off" spellCheck={false} autoFocus />
              <Button type="button" size="icon" onClick={() => setVer((v) => !v)} aria-label={ver ? 'Ocultar' : 'Mostrar'}>
                {ver ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
            </div>
          </div>
          {otraUrl ? (
            <div className="space-y-1.5">
              <Label htmlFor="asist-url">Dirección de AsistencIA</Label>
              <Input id="asist-url" value={urlPropia} onChange={(e) => setUrlPropia(e.target.value)} placeholder="https://arrivecontrol.vercel.app" />
            </div>
          ) : (
            <button type="button" className="text-xs text-muted-foreground underline underline-offset-2" onClick={() => setOtraUrl(true)}>
              Usar otra dirección (solo instalaciones propias)
            </button>
          )}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {conectada ? (
            <Button type="button" variant="ghost" onClick={desconectar} disabled={guardando} className="text-rose-700 dark:text-rose-400">
              <Unplug className="size-4" /> Desconectar
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={guardando}>Cancelar</Button>
            <Button type="button" onClick={guardar} disabled={guardando}>{guardando && <Spinner />} {conectada ? 'Guardar' : 'Conectar'}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
