'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Timer, RefreshCw, Download, KeyRound, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { cn } from '@/lib/utils'
import { Chip, Pill } from '@/components/ui-kit'
import { fmtCOP } from '@/lib/moneda'
import {
  consultarHorasAsistencia, traerHorasAsistencia, previsualizarOrdenPago, generarOrdenPago, marcarPagoPagado, marcarPagoPendiente,
  type ResumenPantalla, type FilaAsistencia,
} from './asistencia-acciones'

/**
 * Las horas extra del período tal como las calcula AsistencIA (control de
 * asistencia), cruzadas por cédula con las fichas de aquí. Aquí se revisa cada
 * período y se traen las horas como novedades pendientes para que la nómina
 * las recoja. La clave la conecta el administrador en Ajustes → Integraciones.
 */

const CODIGOS = ['HED', 'HEN', 'HEDDF', 'HENDF'] as const
const ETIQUETA: Record<string, string> = { HED: 'Diurna', HEN: 'Nocturna', HEDDF: 'Dom/fest. diurna', HENDF: 'Dom/fest. nocturna' }
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

export function PanelAsistencia({ conectada, esAdmin, hoy }: {
  conectada: boolean
  /** Solo el administrador ve el acceso a Ajustes → Integraciones. */
  esAdmin: boolean
  hoy: string
}) {
  const router = useRouter()
  const meses = mesesRecientes(hoy)
  const [mes, setMes] = useState(hoy.slice(0, 7))
  // La quincena en curso: hasta el 15 la primera, después la segunda.
  const [quincena, setQuincena] = useState<1 | 2 | null>(Number(hoy.slice(8, 10)) <= 15 ? 1 : 2)
  const [trayendo, setTrayendo] = useState(false)
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
            {esAdmin && (
              <Button size="icon" asChild aria-label="Clave de API (Ajustes)" title="Clave de API (Ajustes → Integraciones)">
                <Link href="/configuracion/integraciones"><KeyRound className="size-4" /></Link>
              </Button>
            )}
          </div>

          {!conectada ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {esAdmin
                  ? 'Conecta la clave de API de la empresa en Ajustes → Integraciones para ver aquí las horas extra de cada período y traerlas a la nómina.'
                  : 'Pide al administrador que conecte AsistencIA en Ajustes → Integraciones.'}
              </p>
              {esAdmin && (
                <Button size="sm" asChild><Link href="/configuracion/integraciones"><KeyRound className="size-4" /> Conectar</Link></Button>
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
                          <th className="py-1.5 pl-2 text-right font-bold" title="En esta empresa las horas extra se pagan aparte de la nómina">Pago (aparte)</th>
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
                            <td className="py-2 pl-2 text-right">
                              {f.colaboradorId && (
                                <AccionesPago colaboradorId={f.colaboradorId} mes={mes} quincena={quincena} nombre={f.nombre} pagoLocal={f.pagoLocal} sinHoras={f.horasExtra <= 0 || f.valor == null} />
                              )}
                            </td>
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

    </>
  )
}

type PagoLocal = FilaAsistencia['pagoLocal']

/** Lee un archivo como data URI, para mandarlo por la Server Action (mismo patrón que AdjuntarDocumento). */
function leerArchivo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('lectura'))
    reader.readAsDataURL(file)
  })
}

/**
 * Orden de pago + comprobante + estado, persona por persona: el pago de horas
 * extra en esta empresa va APARTE de la nómina, así que no lo cubre ningún
 * desprendible.
 *
 * "Generar orden" primero deja VER el PDF (nada se guarda ni se envía a nadie
 * todavía) y solo si se confirma queda archivado — así no hay sorpresas sobre
 * qué hace el botón. El casillero de pagado siempre pregunta antes de cambiar
 * de estado, en los dos sentidos: marcarlo pide confirmar (con el comprobante
 * como algo opcional, no un formulario aparte) y desmarcarlo también, porque
 * retira el soporte que hubiera.
 */
function AccionesPago({ colaboradorId, mes, quincena, nombre, pagoLocal, sinHoras }: {
  colaboradorId: string
  mes: string
  quincena: 1 | 2 | null
  nombre: string
  pagoLocal: PagoLocal
  /** Sin horas extra o sin salario en AsistencIA: no hay nada que generar todavía. */
  sinHoras: boolean
}) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState<'previa' | 'guardar' | 'pagar' | 'deshacer' | null>(null)
  const [previa, setPrevia] = useState<string | null>(null) // URL de objeto del PDF en vista previa
  const [dialogoPago, setDialogoPago] = useState(false)
  const [dialogoDeshacer, setDialogoDeshacer] = useState(false)
  const [comprobante, setComprobante] = useState<File | null>(null)
  const pagado = pagoLocal?.estado === 'PAGADO'

  function cerrarPrevia() {
    if (previa) URL.revokeObjectURL(previa)
    setPrevia(null)
  }

  async function verOrden() {
    setOcupado('previa')
    const res = await previsualizarOrdenPago({ colaboradorId, mes, quincena })
    setOcupado(null)
    if (!res.ok) { toast.error(res.error); return }
    const base64 = res.datos.pdfBase64.split(',')[1] ?? ''
    const bin = atob(base64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    setPrevia(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })))
  }

  async function guardarOrden() {
    setOcupado('guardar')
    const res = await generarOrdenPago({ colaboradorId, mes, quincena })
    setOcupado(null)
    if (!res.ok) { toast.error(res.error); return }
    toast.success('Orden de pago guardada.')
    cerrarPrevia()
    router.refresh()
  }

  async function confirmarPago() {
    setOcupado('pagar')
    let pdfBase64: string | undefined
    if (comprobante) {
      try {
        pdfBase64 = await leerArchivo(comprobante)
      } catch {
        setOcupado(null); toast.error('No se pudo leer el archivo.'); return
      }
    }
    const res = await marcarPagoPagado({ colaboradorId, mes, quincena, pdfBase64, nombreArchivo: comprobante?.name })
    setOcupado(null)
    if (!res.ok) { toast.error(res.error); return }
    toast.success('Marcado como pagado.')
    setDialogoPago(false)
    setComprobante(null)
    router.refresh()
  }

  async function confirmarDeshacer() {
    setOcupado('deshacer')
    const res = await marcarPagoPendiente({ colaboradorId, mes, quincena })
    setOcupado(null)
    if (!res.ok) { toast.error(res.error); return }
    toast.success('Vuelto a pendiente.')
    setDialogoDeshacer(false)
    router.refresh()
  }

  if (sinHoras && !pagoLocal) {
    return <span className="text-xs text-muted-foreground">—</span>
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <label className="flex cursor-pointer items-center gap-1.5">
        <Checkbox
          checked={pagado}
          onCheckedChange={(v) => (v === true ? setDialogoPago(true) : setDialogoDeshacer(true))}
          disabled={ocupado !== null}
        />
        <span className={cn('text-xs font-semibold', pagado ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')}>
          {pagado ? 'Pagado' : 'Pendiente'}
        </span>
      </label>
      <div className="flex items-center gap-2 text-xs">
        {pagoLocal?.ordenDocId ? (
          <VisorPdf documentoId={pagoLocal.ordenDocId} titulo={`Orden de pago de horas extra · ${nombre}`} className="inline-flex items-center gap-1 text-primary hover:underline">
            <FileText className="size-3" /> Orden
          </VisorPdf>
        ) : (
          !pagado && (
            <button type="button" onClick={verOrden} disabled={ocupado !== null} className="inline-flex items-center gap-1 text-primary hover:underline disabled:opacity-50">
              {ocupado === 'previa' ? <Spinner className="size-3" /> : <FileText className="size-3" />} Generar orden
            </button>
          )
        )}
        {pagado && pagoLocal?.comprobanteDocId && (
          <VisorPdf documentoId={pagoLocal.comprobanteDocId} titulo={`Comprobante de pago de horas extra · ${nombre}`} className="inline-flex items-center gap-1 text-primary hover:underline">
            <Download className="size-3" /> Comprobante
          </VisorPdf>
        )}
      </div>

      {/* Vista previa de la orden: no queda nada guardado hasta que se confirme. */}
      <Dialog open={previa !== null} onOpenChange={(o) => !o && cerrarPrevia()}>
        <DialogContent className="flex h-[85dvh] w-full flex-col gap-3 sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Vista previa · Orden de pago</DialogTitle>
            <DialogDescription>
              De {nombre}. Esto no se envía a nadie: es un PDF para descargarlo y compartirlo tú, por donde uses siempre
              (correo, WhatsApp…), con quien vaya a hacer el pago.
            </DialogDescription>
          </DialogHeader>
          {previa && <iframe src={previa} title="Vista previa de la orden de pago" className="min-h-0 flex-1 rounded-md border bg-white" />}
          <DialogFooter>
            <Button variant="ghost" onClick={cerrarPrevia}>Cerrar sin guardar</Button>
            <Button onClick={guardarOrden} disabled={ocupado !== null}>
              {ocupado === 'guardar' && <Spinner />} Guardar esta orden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar que ya se pagó (comprobante opcional: se puede confirmar sin tenerlo a la mano). */}
      <Dialog open={dialogoPago} onOpenChange={(o) => { setDialogoPago(o); if (!o) setComprobante(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Ya se le pagó a {nombre}?</DialogTitle>
            <DialogDescription>Confirma que ya se hizo el pago de sus horas extra de este período.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="comprobante-pago" className="text-xs text-muted-foreground">Comprobante de pago (opcional)</Label>
            <Input id="comprobante-pago" type="file" accept="application/pdf,image/*" onChange={(e) => setComprobante(e.target.files?.[0] ?? null)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogoPago(false)}>Cancelar</Button>
            <Button onClick={confirmarPago} disabled={ocupado !== null}>
              {ocupado === 'pagar' && <Spinner />} Confirmar pago
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Corregir un pago marcado por error. */}
      <Dialog open={dialogoDeshacer} onOpenChange={setDialogoDeshacer}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Quitar la marca de pagado?</DialogTitle>
            <DialogDescription>Vuelve a pendiente y retira el comprobante, si había uno.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogoDeshacer(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmarDeshacer} disabled={ocupado !== null}>
              {ocupado === 'deshacer' && <Spinner />} Sí, quitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
