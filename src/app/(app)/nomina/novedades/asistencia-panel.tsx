'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Timer, RefreshCw, Download, KeyRound, FileText, FilePlus2, FileCheck2, Receipt, Send, ClipboardList, LockKeyhole, ChevronDown } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { cn } from '@/lib/utils'
import { Chip, Pill, AvatarColaborador } from '@/components/ui-kit'
import { fmtCOP } from '@/lib/moneda'
import {
  consultarHorasAsistencia, traerHorasAsistencia, previsualizarOrdenPago, generarOrdenPago, enviarOrdenAFirma, marcarPagoPagado, marcarPagoPendiente,
  verResumenHoy, type ResumenPantalla, type FilaAsistencia,
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
  // Celular: la persona abierta en el acordeón (por documento).
  const [abierta, setAbierta] = useState<string | null>(null)
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
          <div className="flex items-start gap-2.5">
            <Chip icono={Timer} color="bg-foreground text-background" className="size-9 shrink-0 rounded-[10px]" iconClassName="size-[18px]" />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
                AsistencIA
                <Pill tone={conectada ? 'ok' : 'warn'}>{conectada ? 'Conectada' : 'Sin conectar'}</Pill>
              </p>
              <p className="text-xs text-muted-foreground">
                {conectada ? 'Horas extra y recargos calculados de las marcaciones.' : 'Control de asistencia sin conectar.'}
              </p>
            </div>
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
              {/* El período de pago, como lo liquida nómina: mes y quincena. Una sola
                  franja: a la izquierda qué período, a la derecha qué hacer con él. */}
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2">
                <Select value={mes} onValueChange={setMes}>
                  <SelectTrigger className="h-8 w-40 bg-card text-xs" aria-label="Mes"><SelectValue /></SelectTrigger>
                  <SelectContent>{meses.map((m) => <SelectItem key={m.valor} value={m.valor}>{m.etiqueta}</SelectItem>)}</SelectContent>
                </Select>
                <div className="flex h-8 items-center gap-1.5" role="group" aria-label="Quincena">
                  {([[1, '1 – 15'], [2, '16 – fin'], [null, 'Todo el mes']] as const).map(([q, l]) => (
                    <button
                      key={String(q)}
                      type="button"
                      onClick={() => setQuincena(q)}
                      aria-pressed={quincena === q}
                      className={cn(
                        'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
                        quincena === q ? 'bg-foreground text-background' : 'border bg-card text-muted-foreground hover:bg-accent',
                      )}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <Button size="icon" onClick={() => setVersion((v) => v + 1)} disabled={cargando} aria-label="Actualizar" title="Volver a consultar">
                    {cargando ? <Spinner /> : <RefreshCw className="size-4" />}
                  </Button>
                  <Button onClick={traer} disabled={trayendo || cargando || !datos || datos.filas.length === 0}>
                    {trayendo ? <Spinner /> : <Download className="size-4" />} Traer a la nómina
                  </Button>
                </div>
              </div>

              {error && <p className="mt-3 rounded-lg border border-dashed p-3 text-sm text-rose-700 dark:text-rose-400">{error}</p>}

              {datos && !error && (
                datos.filas.length === 0 ? (
                  <p className="mt-3 py-4 text-center text-sm text-muted-foreground">Sin horas extra del {datos.desde} al {datos.hasta}.</p>
                ) : (
                  <>
                  {/* Celular: acordeón. Cerrada, la persona muestra lo que se mira de un
                      vistazo (horas y valor); el resto se despliega. La tabla no cabía y
                      partía los nombres letra por letra. */}
                  <div className="mt-3 divide-y sm:hidden">
                    {datos.filas.map((f) => {
                      const abiertaEsta = abierta === f.documento
                      const detalle = CODIGOS.filter((c) => f.horas[c]).map((c) => `${ETIQUETA[c]} ${horas(f.horas[c])}`).join(' · ')
                      return (
                        <div key={f.documento}>
                          <button
                            type="button"
                            onClick={() => setAbierta(abiertaEsta ? null : f.documento)}
                            aria-expanded={abiertaEsta}
                            className="flex w-full items-center gap-2.5 py-2.5 text-left"
                          >
                            <AvatarColaborador nombre={f.nombre} fotoUrl={f.fotoUrl} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold">{f.nombre}</p>
                              <p className="text-xs text-muted-foreground tabular-nums">{horas(f.horasExtra)}</p>
                            </div>
                            <span className="shrink-0 text-sm font-semibold tabular-nums">
                              {f.valor == null ? <span className="font-normal text-muted-foreground">—</span> : fmtCOP(f.valor)}
                            </span>
                            <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', abiertaEsta && 'rotate-180')} />
                          </button>
                          {abiertaEsta && (
                            <div className="mb-2.5 space-y-2 rounded-lg bg-muted/40 p-3 text-xs animate-in fade-in slide-in-from-top-1 duration-150">
                              <p className="text-muted-foreground">{f.documento}{f.sede ? ` · ${f.sede}` : ''}</p>
                              {detalle && <p>{detalle}</p>}
                              {f.colaboradorId
                                ? <p className="text-muted-foreground">{f.registrados}/{f.tramos} en nómina{f.periodos.length ? ` (${f.periodos.join(', ')})` : ''}</p>
                                : <Pill tone="bad">Sin ficha activa aquí</Pill>}
                              {f.colaboradorId && (
                                <div className="flex items-center justify-between gap-2 border-t pt-2">
                                  <span className="font-medium">Pago (aparte)</span>
                                  <AccionesPago colaboradorId={f.colaboradorId} mes={mes} quincena={quincena} nombre={f.nombre} pagoLocal={f.pagoLocal} sinHoras={f.horasExtra <= 0 || f.valor == null} />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {t && (
                      <div className="flex items-center justify-between py-2.5 text-sm font-bold">
                        <span>Total · {datos.filas.length} persona{datos.filas.length === 1 ? '' : 's'}</span>
                        <span className="tabular-nums">{horas(t.horasExtra)} · {fmtCOP(t.valor)}</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 hidden overflow-x-auto sm:block">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                          <th className="py-1.5 pr-1.5 text-left font-bold sm:pr-2">Empleado</th>
                          {/* El detalle por tipo de hora solo cabe cómodo desde tablet; en el
                              teléfono va resumido en la segunda línea del nombre. */}
                          {CODIGOS.map((c) => <th key={c} className="hidden py-1.5 px-2 text-right font-bold sm:table-cell" title={ETIQUETA[c]}>{c}</th>)}
                          <th className="py-1.5 px-1.5 text-right font-bold sm:px-2">Total</th>
                          <th className="py-1.5 px-1.5 text-right font-bold sm:px-2">Valor</th>
                          <th className="py-1.5 pl-1.5 text-right font-bold sm:pl-2" title="En esta empresa las horas extra se pagan aparte de la nómina">Pago (aparte)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {datos.filas.map((f) => (
                          <tr key={f.documento} className="align-middle">
                            <td className="py-2 pr-1.5 sm:pr-2">
                              <div className="flex items-center gap-2.5">
                                <AvatarColaborador nombre={f.nombre} fotoUrl={f.fotoUrl} />
                                <div className="min-w-0">
                                  <p className="font-semibold">{f.nombre}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {f.documento}{f.sede ? ` · ${f.sede}` : ''}
                                    {f.colaboradorId
                                      ? ` · ${f.registrados}/${f.tramos} en nómina${f.periodos.length ? ` (${f.periodos.join(', ')})` : ''}`
                                      : ''}
                                  </p>
                                  {/* Mismo detalle que las columnas HED/HEN/HEDDF/HENDF, resumido: en
                                      el teléfono esas columnas están ocultas (arriba). */}
                                  <p className="text-xs text-muted-foreground sm:hidden">
                                    {CODIGOS.filter((c) => f.horas[c]).map((c) => `${ETIQUETA[c]} ${horas(f.horas[c])}`).join(' · ')}
                                  </p>
                                  {!f.colaboradorId && <Pill tone="bad" className="mt-1">Sin ficha activa aquí</Pill>}
                                </div>
                              </div>
                            </td>
                            {CODIGOS.map((c) => (
                              <td key={c} className={cn('hidden py-2 px-2 text-right tabular-nums sm:table-cell', f.horas[c] ? 'font-semibold' : 'text-muted-foreground')}>{horas(f.horas[c])}</td>
                            ))}
                            <td className="whitespace-nowrap py-2 px-1.5 text-right tabular-nums sm:px-2">{horas(f.horasExtra)}</td>
                            <td className="whitespace-nowrap py-2 px-1.5 text-right font-semibold tabular-nums sm:px-2">{f.valor == null ? <span className="font-normal text-muted-foreground" title="Sin salario en AsistencIA">—</span> : fmtCOP(f.valor)}</td>
                            <td className="py-2 pl-1.5 text-right sm:pl-2">
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
                            <td className="py-2 pr-1.5 sm:pr-2">Total · {datos.filas.length} persona{datos.filas.length === 1 ? '' : 's'}</td>
                            {CODIGOS.map((c) => <td key={c} className="hidden py-2 px-2 text-right tabular-nums sm:table-cell">{horas(t.horas[c] ?? 0)}</td>)}
                            <td className="py-2 px-1.5 text-right tabular-nums sm:px-2">{horas(t.horasExtra)}</td>
                            <td className="py-2 px-1.5 text-right tabular-nums sm:px-2">{fmtCOP(t.valor)}</td>
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
                  </>
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
  const [ocupado, setOcupado] = useState<'previa' | 'guardar' | 'enviar' | 'pagar' | 'deshacer' | null>(null)
  const [previa, setPrevia] = useState<Blob | null>(null)
  const [dialogoPago, setDialogoPago] = useState(false)
  const [dialogoDeshacer, setDialogoDeshacer] = useState(false)
  const [comprobante, setComprobante] = useState<File | null>(null)
  const estado = pagoLocal?.estado
  const pagado = estado === 'PAGADO'
  const firmada = estado === 'FIRMADA' || pagado

  async function verOrden() {
    setOcupado('previa')
    const res = await previsualizarOrdenPago({ colaboradorId, mes, quincena })
    setOcupado(null)
    if (!res.ok) { toast.error(res.error); return }
    const base64 = res.datos.pdfBase64.split(',')[1] ?? ''
    const bin = atob(base64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    setPrevia(new Blob([bytes], { type: 'application/pdf' }))
  }

  async function guardarOrden() {
    setOcupado('guardar')
    const res = await generarOrdenPago({ colaboradorId, mes, quincena })
    setOcupado(null)
    if (!res.ok) { toast.error(res.error); return }
    toast.success('Orden de pago guardada.')
    setPrevia(null)
    router.refresh()
  }

  async function enviarAFirmar() {
    if (!pagoLocal) return
    setOcupado('enviar')
    const res = await enviarOrdenAFirma({ pagoId: pagoLocal.id })
    setOcupado(null)
    if (!res.ok) { toast.error(res.error); return }
    toast.success('Enviada a firmar. Se avisó al colaborador en su autoservicio.')
    router.refresh()
  }

  async function confirmarPago() {
    if (!pagoLocal) return
    setOcupado('pagar')
    let pdfBase64: string | undefined
    if (comprobante) {
      try {
        pdfBase64 = await leerArchivo(comprobante)
      } catch {
        setOcupado(null); toast.error('No se pudo leer el archivo.'); return
      }
    }
    const res = await marcarPagoPagado({ pagoId: pagoLocal.id, pdfBase64, nombreArchivo: comprobante?.name })
    setOcupado(null)
    if (!res.ok) { toast.error(res.error); return }
    toast.success('Marcado como pagado.')
    setDialogoPago(false)
    setComprobante(null)
    router.refresh()
  }

  async function confirmarDeshacer() {
    if (!pagoLocal) return
    setOcupado('deshacer')
    const res = await marcarPagoPendiente({ pagoId: pagoLocal.id })
    setOcupado(null)
    if (!res.ok) { toast.error(res.error); return }
    toast.success('Corregido: vuelve a "firmada".')
    setDialogoDeshacer(false)
    router.refresh()
  }

  // Sin horas (o sin salario allá) y sin pago iniciado: no hay orden que generar,
  // pero el aviso de prueba del día sí se puede mandar.
  const sinPago = sinHoras && !pagoLocal

  const ESTADO: Record<string, { texto: string; tone: 'muted' | 'warn' | 'info' | 'ok' }> = {
    PENDIENTE: { texto: 'Sin firmar', tone: 'muted' },
    ENVIADA_A_FIRMA: { texto: 'Esperando firma', tone: 'warn' },
    FIRMADA: { texto: 'Firmada', tone: 'info' },
    PAGADO: { texto: 'Pagado', tone: 'ok' },
  }
  // PENDIENTE cubre dos momentos: sin orden todavía, o con la orden guardada pero sin enviar.
  const est = pagoLocal
    ? pagoLocal.estado === 'PENDIENTE'
      ? { texto: pagoLocal.ordenDocId ? 'Orden sin enviar' : 'Sin orden', tone: 'muted' as const }
      : ESTADO[pagoLocal.estado]
    : null
  const icono = buttonVariants({ size: 'icon-sm' })

  return (
    <div className="flex items-center justify-end gap-1.5">
      {/* Estado y casilla de pagado. Los botones son solo íconos: el nombre va en el título. */}
      {!sinPago && (
        <label
          className={cn('flex items-center gap-1.5', firmada ? 'cursor-pointer' : 'cursor-not-allowed')}
          title={pagado ? 'Pagado (quitar la marca abre una confirmación)' : firmada ? 'Marcar como pagado' : 'La orden debe estar firmada por el colaborador antes de poder marcar el pago'}
        >
          <Checkbox
            checked={pagado}
            onCheckedChange={(v) => (v === true ? setDialogoPago(true) : setDialogoDeshacer(true))}
            disabled={ocupado !== null || !firmada}
            aria-label="Pagado"
          />
          <Pill tone={est?.tone ?? 'muted'} className="whitespace-nowrap">
            {est?.texto ?? 'Sin orden'}
            {pagoLocal?.anotadoEnAsistencia && <LockKeyhole className="ml-1 inline size-3" aria-label="Cerrado y marcado como pagado en AsistencIA" />}
          </Pill>
        </label>
      )}

      {!sinPago && (
        pagoLocal?.ordenDocId ? (
          <span title={firmada ? 'Ver la orden firmada' : 'Ver la orden de pago'}>
            <VisorPdf documentoId={pagoLocal.ordenDocId} titulo={`Orden de pago de horas extra · ${nombre}`} className={icono}>
              {firmada ? <FileCheck2 className="size-3.5" /> : <FileText className="size-3.5" />}
              <span className="sr-only">{firmada ? 'Ver la orden firmada' : 'Ver la orden de pago'}</span>
            </VisorPdf>
          </span>
        ) : (
          !pagado && (
            <Button size="icon-sm" onClick={verOrden} disabled={ocupado !== null} aria-label="Generar orden de pago" title="Generar orden de pago (primero se ve; se guarda si confirmas)">
              {ocupado === 'previa' ? <Spinner className="size-3.5" /> : <FilePlus2 className="size-3.5" />}
            </Button>
          )
        )
      )}
      {/* Solo se puede enviar mientras está PENDIENTE (orden generada, sin enviar). */}
      {estado === 'PENDIENTE' && (
        <Button size="icon-sm" onClick={enviarAFirmar} disabled={ocupado !== null} aria-label="Enviar a firmar" title="Enviar a firmar (le llega al colaborador en su autoservicio)">
          {ocupado === 'enviar' ? <Spinner className="size-3.5" /> : <Send className="size-3.5" />}
        </Button>
      )}
      {pagado && pagoLocal?.comprobanteDocId && (
        <span title="Ver el comprobante de pago">
          <VisorPdf documentoId={pagoLocal.comprobanteDocId} titulo={`Comprobante de pago de horas extra · ${nombre}`} className={icono}>
            <Receipt className="size-3.5" />
            <span className="sr-only">Ver el comprobante de pago</span>
          </VisorPdf>
        </span>
      )}
      <BotonResumenHoy colaboradorId={colaboradorId} nombre={nombre} />

      {/* Vista previa de la orden: no queda nada guardado hasta que se confirme. Mismo
          visor que "Ver orden" (con su respaldo para móvil), pero sin botón propio: se
          abre solo apenas el PDF está listo. */}
      {previa && (
        <VisorPdf
          archivo={previa}
          titulo={`Vista previa · Orden de pago · ${nombre}`}
          abierto
          onAbiertoChange={(v) => !v && setPrevia(null)}
          pie={
            <div className="space-y-2 border-t pt-2">
              <p className="text-xs text-muted-foreground">
                Esto no se envía a nadie: descárgala y compártela tú, por donde uses siempre (correo, WhatsApp…), con quien vaya a hacer el pago.
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setPrevia(null)}>Cerrar sin guardar</Button>
                <Button size="sm" onClick={guardarOrden} disabled={ocupado !== null}>
                  {ocupado === 'guardar' && <Spinner />} Guardar esta orden
                </Button>
              </div>
            </div>
          }
        />
      )}

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
            <DialogDescription>Vuelve a &quot;firmada&quot; (la firma del colaborador no se toca) y retira el comprobante, si había uno.</DialogDescription>
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

const NOMBRE_TIPO_HORA: Record<string, string> = {
  HED: 'Extra diurna', HEN: 'Extra nocturna', HEDDF: 'Dom/fest. diurna', HENDF: 'Dom/fest. nocturna',
}

type Reporte = { colaborador: string; fecha: string; tramos: { horaInicio: string; horaFin: string; tipoHora: string; horas: number }[]; totalHoras: number; mensaje: string }

/**
 * Lo que AsistencIA registró HOY de esa persona, para revisarlo aquí mismo.
 *
 * Mientras las horas extra estén en prueba esto no le llega a nadie: es un
 * reporte para quien está comprobando que los números cuadren. El día que el
 * módulo salga de pruebas, este mismo texto es el que recibirá el colaborador.
 */
function BotonResumenHoy({ colaboradorId, nombre }: { colaboradorId: string; nombre: string }) {
  const [cargando, setCargando] = useState(false)
  const [reporte, setReporte] = useState<Reporte | null>(null)

  async function ver() {
    setCargando(true)
    const res = await verResumenHoy({ colaboradorId })
    setCargando(false)
    if (!res.ok) { toast.error(res.error, { duration: 8000 }); return }
    setReporte(res.datos as Reporte)
  }

  return (
    <>
      <Button
        size="icon-sm"
        variant="secondary"
        onClick={ver}
        disabled={cargando}
        aria-label={`Ver lo que ${nombre} registró hoy`}
        title="Ver lo que AsistencIA le registró hoy (solo para revisar; no se le envía nada)"
      >
        {cargando ? <Spinner className="size-3.5" /> : <ClipboardList className="size-3.5" />}
      </Button>

      <Dialog open={reporte !== null} onOpenChange={(o) => { if (!o) setReporte(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Hoy en AsistencIA · {reporte?.colaborador ?? nombre}</DialogTitle>
            <DialogDescription>Lo que lleva registrado en el día. Es solo para revisar: al colaborador no le llega nada.</DialogDescription>
          </DialogHeader>

          {reporte && (reporte.tramos.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Hoy no tiene horas extra ni recargos registrados.</p>
          ) : (
            <div className="space-y-2">
              <table className="w-full text-sm">
                <tbody className="divide-y">
                  {reporte.tramos.map((t, i) => (
                    <tr key={i}>
                      <td className="py-1.5 tabular-nums">{t.horaInicio}–{t.horaFin}</td>
                      <td className="py-1.5 text-muted-foreground">{NOMBRE_TIPO_HORA[t.tipoHora] ?? t.tipoHora}</td>
                      <td className="py-1.5 text-right font-semibold tabular-nums">{horas(t.horas)}</td>
                    </tr>
                  ))}
                  <tr className="border-t font-bold">
                    <td className="py-1.5" colSpan={2}>Total</td>
                    <td className="py-1.5 text-right tabular-nums">{horas(reporte.totalHoras)}</td>
                  </tr>
                </tbody>
              </table>
              <p className="rounded-lg border border-dashed p-2 text-xs text-muted-foreground">
                Cuando el módulo salga de pruebas, esto es lo que le llegará: &ldquo;{reporte.mensaje}&rdquo;
              </p>
            </div>
          ))}
        </DialogContent>
      </Dialog>
    </>
  )
}
