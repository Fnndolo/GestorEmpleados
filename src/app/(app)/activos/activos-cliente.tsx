'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Laptop, Shirt, Download, UserPlus, Undo2, Trash2, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SelectorColaborador } from '@/components/colaboradores/selector-colaborador'
import { cn } from '@/lib/utils'
import { Chip, Pill, type PillTone } from '@/components/ui-kit'
import { Ayuda } from '@/components/ui-kit/ayuda'
import { AdjuntarDocumento } from '@/components/documentos/adjuntar-documento'
import { Checkbox } from '@/components/ui/checkbox'
import { fmtCOP } from '@/lib/moneda'
import { formatFechaCorta } from '@/lib/fechas'
import { crearActivos, asignarActivos, devolverActivo, registrarDotacion } from './acciones'

type Activo = { id: string; codigo: string; nombre: string; tipo: string; estado: string; valor: number | null; asignacion: { id: string; colaborador: string; actaEntregaDocId: string | null; actaFirmada: boolean } | null }
type Dotacion = {
  id: string; colaborador: string; anio: number; corte: string; items: string; fechaEntrega: string
  /** PDF del recibido (arts. 230-234 CST); lo firma el colaborador desde su autoservicio. */
  recibidoDocId: string | null
  firmado: boolean
}
type Sede = { id: string; nombre: string; ciudad: string }

const ESTADO: Record<string, string> = { DISPONIBLE: 'Disponible', ASIGNADO: 'Asignado', EN_MANTENIMIENTO: 'Mantenimiento', DADO_DE_BAJA: 'De baja' }
const TONO_ACTIVO: Record<string, PillTone> = { DISPONIBLE: 'ok', ASIGNADO: 'info', EN_MANTENIMIENTO: 'warn', DADO_DE_BAJA: 'muted' }

export function ActivosCliente({ activos, dotaciones, sedes, sedeActual, puedeCrear, puedeEditar }: { activos: Activo[]; dotaciones: Dotacion[]; sedes: Sede[]; sedeActual: string; puedeCrear: boolean; puedeEditar: boolean }) {
  const [tab, setTab] = useState<'activos' | 'dotacion'>('activos')
  const [dialogo, setDialogo] = useState<'activo' | 'asignar' | 'dotacion' | null>(null)
  const [asignarActivoId, setAsignarActivoId] = useState<string | null>(null)
  const disponibles = activos.filter((a) => a.estado === 'DISPONIBLE')
  const hayDisponibles = disponibles.length > 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1.5">
          {(['activos', 'dotacion'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={cn('rounded-full px-3 py-1.5 text-sm font-medium', tab === t ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent')}>
              {t === 'activos' ? 'Activos' : 'Dotación'}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {/* Entrega desde el inventario: se eligen los activos y luego a quién van.
              El botón por fila sigue existiendo como atajo cuando ya sabes cuál. */}
          {tab === 'activos' && puedeEditar && hayDisponibles && (
            <Button size="sm" variant="outline" onClick={() => { setAsignarActivoId(''); setDialogo('asignar') }}>
              <UserPlus className="size-4" /> Asignar
            </Button>
          )}
          {puedeCrear && (
            <Button size="sm" onClick={() => setDialogo(tab === 'activos' ? 'activo' : 'dotacion')}>
              <Plus className="size-4" /> {tab === 'activos' ? 'Nuevos activos' : 'Registrar dotación'}
            </Button>
          )}
        </div>
      </div>

      {tab === 'activos' ? (
        activos.length === 0 ? <Vacio icono={Laptop} /> : (
          <Card><CardContent className="p-0 divide-y">
            {activos.map((a) => (
              <div key={a.id} className="flex items-center gap-3 p-3">
                <Chip icono={Laptop} color="ink" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{a.nombre}</p>
                  <p className="text-xs text-muted-foreground">{a.codigo} · {a.tipo}{a.asignacion && ` · ${a.asignacion.colaborador}`}</p>
                </div>
                {a.asignacion && (
                  <Pill tone={a.asignacion.actaFirmada ? 'ok' : 'warn'}>
                    {a.asignacion.actaFirmada ? 'Acta firmada' : 'Acta sin firmar'}
                  </Pill>
                )}
                <Pill tone={TONO_ACTIVO[a.estado] ?? 'muted'}>{ESTADO[a.estado]}</Pill>
                {a.asignacion?.actaEntregaDocId && (
                  <Button variant="ghost" size="icon" asChild aria-label="Acta"><a href={`/api/documentos/${a.asignacion.actaEntregaDocId}`} target="_blank" rel="noreferrer"><Download className="size-4" /></a></Button>
                )}
                {/* El acta generada se puede reemplazar por una propia: a veces
                    la firmada en papel es la que vale. */}
                {puedeEditar && a.asignacion && (
                  <AdjuntarDocumento
                    destino="actaEntregaActivo" id={a.asignacion.id} tamano="icon" variante="ghost"
                    tieneDocumento={Boolean(a.asignacion.actaEntregaDocId)}
                    etiqueta={a.asignacion.actaEntregaDocId ? 'Rehacer o reemplazar el acta' : 'Generar o subir el acta'}
                  />
                )}
                {puedeEditar && a.estado === 'DISPONIBLE' && (
                  <Button variant="outline" size="sm" onClick={() => { setAsignarActivoId(a.id); setDialogo('asignar') }}><UserPlus className="size-4" /> Entregar</Button>
                )}
                {puedeEditar && a.asignacion && (
                  <DevolverBoton asignacionId={a.asignacion.id} />
                )}
              </div>
            ))}
          </CardContent></Card>
        )
      ) : (
        dotaciones.length === 0 ? <Vacio icono={Shirt} /> : (
          <Card><CardContent className="p-0 divide-y">
            {dotaciones.map((d) => (
              <div key={d.id} className="flex items-center gap-3 p-3">
                <Chip icono={Shirt} color="violet" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm">{d.colaborador}</p>
                  <p className="text-xs text-muted-foreground">{d.corte} {d.anio} · {formatFechaCorta(new Date(d.fechaEntrega))} · {d.items}</p>
                </div>
                {d.recibidoDocId && (
                  <Button variant="ghost" size="icon" asChild aria-label="Recibido PDF">
                    <a href={`/api/documentos/${d.recibidoDocId}`} target="_blank" rel="noreferrer"><Download className="size-4" /></a>
                  </Button>
                )}
                {puedeEditar && (
                  <AdjuntarDocumento
                    destino="recibidoDotacion" id={d.id} tamano="icon" variante="ghost"
                    tieneDocumento={Boolean(d.recibidoDocId)}
                    etiqueta={d.recibidoDocId ? 'Rehacer o reemplazar el recibido' : 'Generar o subir el recibido'}
                  />
                )}
                <Pill tone={d.firmado ? 'ok' : 'warn'}>{d.firmado ? 'Firmado' : 'Pendiente de firma'}</Pill>
              </div>
            ))}
          </CardContent></Card>
        )
      )}

      {dialogo === 'activo' && <DialogActivo sedes={sedes} sedeActual={sedeActual} onClose={() => setDialogo(null)} />}
      {dialogo === 'asignar' && asignarActivoId !== null && (
        <DialogAsignar
          activoId={asignarActivoId}
          disponibles={disponibles}
          onClose={() => { setDialogo(null); setAsignarActivoId(null) }}
        />
      )}
      {dialogo === 'dotacion' && <DialogDotacion onClose={() => setDialogo(null)} />}
    </div>
  )
}

function Vacio({ icono: Icono }: { icono: typeof Laptop }) {
  return <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground"><Icono className="size-8" /><p>Sin registros.</p></CardContent></Card>
}

function DevolverBoton({ asignacionId }: { asignacionId: string }) {
  const router = useRouter()
  const [c, setC] = useState(false)
  return (
    <Button variant="ghost" size="sm" disabled={c} onClick={async () => {
      setC(true); const res = await devolverActivo({ asignacionId }); setC(false)
      if (res.ok) { toast.success('Activo devuelto. Acta generada.'); router.refresh() } else toast.error(res.error)
    }}>{c ? <Spinner /> : <Undo2 className="size-4" />} Devolver</Button>
  )
}

/** Una línea del alta en lote. La sede es común a todas y va aparte. */
type FilaActivo = { codigo: string; nombre: string; tipo: string; marca: string; serie: string; valor: string }
const FILA_VACIA: FilaActivo = { codigo: '', nombre: '', tipo: '', marca: '', serie: '', valor: '' }

/**
 * Alta de activos en lote: un computador, un mouse, un teclado y una silla se
 * registran de una sola vez en vez de abrir el formulario cuatro veces.
 */
function DialogActivo({ sedes, sedeActual, onClose }: { sedes: Sede[]; sedeActual: string; onClose: () => void }) {
  const router = useRouter()
  const [filas, setFilas] = useState<FilaActivo[]>([{ ...FILA_VACIA }])
  const [sedeId, setSedeId] = useState(sedeActual)
  /** Índice del activo abierto en el acordeón; los demás quedan resumidos. */
  const [abierto, setAbierto] = useState(0)
  const [g, setG] = useState(false)

  const set = (i: number, k: keyof FilaActivo, v: string) =>
    setFilas((p) => p.map((f, j) => (j === i ? { ...f, [k]: v } : f)))

  function añadir() {
    setFilas((p) => [...p, { ...FILA_VACIA }])
    setAbierto(filas.length) // el nuevo entra abierto y el anterior se pliega
  }

  function quitar(i: number) {
    setFilas((p) => p.filter((_, j) => j !== i))
    // Al borrar una tarjeta, el índice abierto se corre para no apuntar a otra.
    setAbierto((a) => (a > i ? a - 1 : Math.min(a, filas.length - 2)))
  }

  /** Se ignoran las filas que quedaron en blanco al añadir una de más. */
  const llenas = filas.filter((f) => f.codigo.trim() || f.nombre.trim() || f.tipo.trim())

  async function guardar() {
    if (llenas.length === 0) { toast.error('Completa al menos un activo.'); return }
    const incompleta = llenas.findIndex((f) => !f.codigo.trim() || !f.nombre.trim() || !f.tipo.trim())
    if (incompleta >= 0) { toast.error(`Al activo ${incompleta + 1} le falta código, nombre o tipo.`); return }

    setG(true)
    const res = await crearActivos({
      activos: llenas.map((f) => ({
        codigo: f.codigo.trim(), nombre: f.nombre.trim(), tipo: f.tipo.trim(),
        marca: f.marca.trim(), serie: f.serie.trim(),
        valor: f.valor ? Number(f.valor) : undefined,
        sedeId,
      })),
    })
    setG(false)
    if (res.ok) {
      toast.success(llenas.length === 1 ? 'Activo creado.' : `${llenas.length} activos creados.`)
      onClose(); router.refresh()
    } else toast.error(res.error)
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !g) onClose() }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            Nuevos activos
            <Ayuda texto="Puedes registrar varios de una vez: computador, mouse, teclado, silla… Se crean todos juntos o ninguno, así que un código repetido no deja el inventario a medias." />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Campo label="Sede (para todos)">
            <Select value={sedeId} onValueChange={setSedeId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Sede…" /></SelectTrigger>
              <SelectContent>{sedes.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}</SelectContent>
            </Select>
          </Campo>

          {/* Acordeón: solo el activo en edición está abierto. Los ya escritos se
              resumen en una línea, para que al llenar el quinto se siga viendo la
              lista completa en vez de un formulario kilométrico. */}
          {filas.map((f, i) => {
            const abierta = i === abierto
            const resumen = [f.nombre.trim(), f.codigo.trim(), f.tipo.trim()].filter(Boolean).join(' · ')
            return (
              <div key={i} className="overflow-hidden rounded-lg border">
                <div className={cn('flex items-center gap-2 px-3 py-2', !abierta && 'bg-muted/40')}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-muted-foreground">Activo {i + 1}</span>
                    {!abierta && (
                      <span className="block truncate text-sm">{resumen || <span className="text-muted-foreground">Sin datos</span>}</span>
                    )}
                  </span>
                  {!abierta && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => setAbierto(i)}>
                      <Pencil className="size-4" /> Editar
                    </Button>
                  )}
                  {filas.length > 1 && (
                    <Button type="button" size="icon" variant="ghost" className="size-7" onClick={() => quitar(i)} aria-label="Quitar activo">
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
                {abierta && (
                  <div className="grid grid-cols-2 gap-3 border-t p-3">
                    <Campo label="Código"><Input value={f.codigo} onChange={(e) => set(i, 'codigo', e.target.value)} placeholder="EQ-001" /></Campo>
                    <Campo label="Tipo"><Input value={f.tipo} onChange={(e) => set(i, 'tipo', e.target.value)} placeholder="Computador, Mouse, Silla…" /></Campo>
                    <div className="col-span-2"><Campo label="Nombre"><Input value={f.nombre} onChange={(e) => set(i, 'nombre', e.target.value)} placeholder="Portátil Lenovo ThinkPad E14" /></Campo></div>
                    <Campo label="Marca"><Input value={f.marca} onChange={(e) => set(i, 'marca', e.target.value)} /></Campo>
                    <Campo label="Serie"><Input value={f.serie} onChange={(e) => set(i, 'serie', e.target.value)} /></Campo>
                    <div className="col-span-2"><Campo label="Valor"><Input type="number" value={f.valor} onChange={(e) => set(i, 'valor', e.target.value)} placeholder="0" /></Campo></div>
                  </div>
                )}
              </div>
            )
          })}

          <Button type="button" variant="outline" size="sm" className="w-full" onClick={añadir}>
            <Plus className="size-4" /> Añadir otro activo
          </Button>
        </div>

        <DialogFooter>
          <Button variant="ghost" disabled={g} onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={g}>
            {g && <Spinner />}{llenas.length > 1 ? `Crear ${llenas.length} activos` : 'Crear activo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Entrega de activos. Arranca con el activo desde el que se pulsó "Asignar", y
 * permite sumar los demás disponibles: todos los marcados salen en UNA sola acta.
 */
function DialogAsignar({ activoId, disponibles, onClose }: {
  /** Activo desde el que se abrió (queda premarcado). Vacío si se entró por el botón general. */
  activoId: string
  /** Activos en estado DISPONIBLE, incluido el de partida. */
  disponibles: Activo[]
  onClose: () => void
}) {
  const router = useRouter()
  const [colaboradorId, setColaboradorId] = useState('')
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [seleccion, setSeleccion] = useState<string[]>(activoId ? [activoId] : [])
  const [busqueda, setBusqueda] = useState('')
  const [g, setG] = useState(false)

  function alternar(id: string) {
    setSeleccion((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  const q = busqueda.trim().toLowerCase()
  const listados = q
    ? disponibles.filter((a) => `${a.nombre} ${a.codigo} ${a.tipo}`.toLowerCase().includes(q))
    : disponibles
  const total = disponibles.filter((a) => seleccion.includes(a.id)).reduce((s, a) => s + (a.valor ?? 0), 0)

  async function guardar() {
    if (!colaboradorId) { toast.error('Selecciona un colaborador.'); return }
    if (seleccion.length === 0) { toast.error('Marca al menos un activo.'); return }
    setG(true)
    const res = await asignarActivos({ activoIds: seleccion, colaboradorId, fechaEntrega: fecha })
    setG(false)
    if (res.ok) {
      toast.success(seleccion.length === 1 ? 'Activo asignado. Acta de entrega generada.' : `${seleccion.length} activos asignados en una sola acta.`)
      onClose(); router.refresh()
    } else toast.error(res.error)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            Entregar activos
            <Ayuda texto="Marca todos los que entregas en el mismo acto: se generan como una sola acta, que el colaborador firma una única vez desde su autoservicio." />
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Campo label="Colaborador"><SelectorColaborador value={colaboradorId} onChange={(id) => setColaboradorId(id)} /></Campo>
          <Campo label="Fecha de entrega"><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Campo>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Activos a entregar</Label>
              <span className="text-xs text-muted-foreground">
                {seleccion.length} marcado(s){total > 0 && ` · ${fmtCOP(total)}`}
              </span>
            </div>
            {disponibles.length > 6 && (
              <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre, código o tipo…" />
            )}
            <div className="max-h-56 divide-y overflow-y-auto rounded-lg border">
              {listados.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">Ningún activo disponible coincide.</p>
              ) : listados.map((a) => (
                <label key={a.id} className="flex cursor-pointer items-center gap-2.5 p-2.5 hover:bg-accent/40">
                  <Checkbox checked={seleccion.includes(a.id)} onCheckedChange={() => alternar(a.id)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{a.nombre}</span>
                    <span className="block truncate text-xs text-muted-foreground">{a.codigo} · {a.tipo}</span>
                  </span>
                  {a.valor != null && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{fmtCOP(a.valor)}</span>}
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={g}>{g && <Spinner />}Entregar y generar acta</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DialogDotacion({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [colaboradorId, setColaboradorId] = useState('')
  const [anio, setAnio] = useState(String(new Date().getUTCFullYear()))
  const [corte, setCorte] = useState('Abril')
  const [items, setItems] = useState('')
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [g, setG] = useState(false)
  async function guardar() {
    if (!colaboradorId) { toast.error('Selecciona un colaborador.'); return }
    setG(true)
    const res = await registrarDotacion({ colaboradorId, anio: Number(anio), corte: corte as 'Abril', items, fechaEntrega: fecha })
    setG(false)
    if (res.ok) { toast.success('Dotación registrada.'); onClose(); router.refresh() } else toast.error(res.error)
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Registrar entrega de dotación</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <Campo label="Colaborador"><SelectorColaborador value={colaboradorId} onChange={(id) => setColaboradorId(id)} /></Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Corte (entrega)">
              <Select value={corte} onValueChange={setCorte}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Abril">Abril</SelectItem><SelectItem value="Agosto">Agosto</SelectItem><SelectItem value="Diciembre">Diciembre</SelectItem></SelectContent></Select>
            </Campo>
            <Campo label="Año"><Input type="number" value={anio} onChange={(e) => setAnio(e.target.value)} /></Campo>
          </div>
          <Campo label="Prendas entregadas"><Textarea rows={2} value={items} onChange={(e) => setItems(e.target.value)} placeholder="2 camisas, 1 pantalón, 1 par de zapatos…" /></Campo>
          <Campo label="Fecha de entrega"><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Campo>
        </div>
        <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={guardar} disabled={g}>{g && <Spinner />}Registrar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>
}
