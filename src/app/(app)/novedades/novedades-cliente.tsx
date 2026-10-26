'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Plus, Search, CircleCheck, ClockPlus, Paperclip, TreePalm, Stethoscope, File, Clock, CreditCard, Check, X, FileCheck, Ban,
  Pencil, Trash2, Pause, Play, Users, RotateCcw, type LucideIcon,
} from 'lucide-react'
import { Pill, type PillTone, type ChipColor } from '@/components/ui-kit'
import { ETIQUETA_COMPROBANTE, type SituacionComprobante } from '@/lib/comprobante-permiso'
import { ListaAcordeon } from '@/components/ui-kit/lista-acordeon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SelectorColaborador } from '@/components/colaboradores/selector-colaborador'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { FiltroTabs } from '@/components/shell/filtro-tabs'
import { useBusquedaEnVivo } from '@/hooks/use-busqueda-en-vivo'
import { cn } from '@/lib/utils'
import { fmtCOP } from '@/lib/moneda'
import { formatFechaCorta } from '@/lib/fechas'
import {
  registrarVacaciones, registrarLicencia, registrarPermiso,
  registrarBonificacion, marcarBonificacionPagada,
  verificarComprobantePermiso, cambiarExigenciaComprobante,
  anularPermiso, anularLicencia, editarPermiso,
  editarVacaciones, anularVacaciones, interrumpirVacaciones, reanudarVacaciones, registrarVacacionesColectivas,
  editarBonificacion, eliminarBonificacion, devolverBonificacionAPendiente,
  editarAutorizacionHorasExtra, eliminarAutorizacionHorasExtra,
} from './acciones'
import { ListaIncapacidades, DialogIncapacidad, type IncapacidadItem } from './incapacidades'

// Permisos primero: es la novedad que más se pide (y la pestaña por defecto).
const TABS = [
  { v: 'permisos', l: 'Permisos' }, { v: 'horas-extra', l: 'Horas extra' }, { v: 'vacaciones', l: 'Vacaciones' }, { v: 'incapacidades', l: 'Incapacidades' },
  { v: 'licencias', l: 'Licencias' }, { v: 'bonificaciones', l: 'Bonificaciones' },
]

const TIPO_LIC: Record<string, string> = {
  MATERNIDAD: 'Maternidad', PATERNIDAD: 'Paternidad', LUTO: 'Luto', CALAMIDAD: 'Calamidad', MATRIMONIO: 'Matrimonio',
  ESTUDIO: 'Estudio', NO_REMUNERADA: 'No remunerada', DIA_DE_LA_FAMILIA: 'Día de la familia',
  DIA_COMPENSATORIO_VOTACION: 'Día compensatorio (votación)', OTRA: 'Otra',
}
const ESTADO_VAC: Record<string, string> = {
  SOLICITADA: 'Solicitada', APROBADA: 'Aprobada', EN_DISFRUTE: 'En disfrute', DISFRUTADA: 'Disfrutada', RECHAZADA: 'Rechazada', CANCELADA: 'Cancelada',
}

/** El estado se lee de un vistazo por color — misma paleta que "Mi actividad" de autoservicio. */
const TONO_ESTADO: Record<string, PillTone> = {
  APROBADA: 'ok', DISFRUTADA: 'ok', PAGADO: 'ok',
  EN_DISFRUTE: 'info',
  SOLICITADA: 'warn', PENDIENTE: 'warn',
  RECHAZADA: 'bad',
  CANCELADA: 'muted',
}

const obligatorio = <span className="text-destructive">*</span>

/** Comprobante de asistencia de un permiso, ya formateado en el servidor. */
type ComprobanteNov = {
  situacion: SituacionComprobante
  vence: string | null
  entregadoEn: string | null
  nota: string | null
  docId: string | null
}

type Datos = {
  vacaciones: {
    id: string; colaborador: string; colaboradorId: string; fotoUrl: string | null; fechaInicio: string; fechaFin: string; dias: number; estado: string
    observaciones: string | null; desdeAutoservicio: boolean; soporteDocId: string | null
    /** Quedaron interrumpidas (RIT art. 36): se pueden reanudar. */
    interrumpidas: boolean
    /** Una nómina ya las pagó por adelantado. */
    pagadasAnticipado: boolean
  }[]
  incapacidades: IncapacidadItem[]
  licencias: { id: string; colaborador: string; colaboradorId: string; fotoUrl: string | null; tipo: string; fechaInicio: string; fechaFin: string; dias: number; remunerada: boolean; desdeAutoservicio: boolean }[]
  permisos: {
    id: string; colaborador: string; colaboradorId: string; fotoUrl: string | null; fecha: string; diaCompleto: boolean; horas: number | null; motivo: string
    horaInicio: string | null; horaFin: string | null; remunerado: boolean
    desdeAutoservicio: boolean; soporteDocId: string | null; comprobante: ComprobanteNov
  }[]
  bonificaciones: {
    id: string; colaborador: string; colaboradorId: string; fotoUrl: string | null; concepto: string; valor: number; constitutivoSalario: boolean; estadoPago: string; fechaPago: string | null
    observaciones: string | null
    /** La pagó un periodo de nómina (no se marcó a mano). */
    pagadaPorNomina: boolean
  }[]
  horasExtra: { id: string; colaborador: string; colaboradorId: string; fotoUrl: string | null; fecha: string; horaInicio: string; horaFin: string; horas: number; motivo: string; posterior: boolean; soporteDocId: string | null }[]
}
type Vacacion = Datos['vacaciones'][number]
type Permiso = Datos['permisos'][number]
type Bonificacion = Datos['bonificaciones'][number]
type Autorizacion = Datos['horasExtra'][number]
type Catalogos = { sedes: { id: string; nombre: string }[]; areas: { id: string; nombre: string }[] }

/** Ícono y color por tipo de novedad — mismo lenguaje visual que "Mi actividad" de autoservicio. */
const CHIP_NOV: Record<string, { icono: LucideIcon; color: ChipColor }> = {
  vacaciones: { icono: TreePalm, color: 'emerald' },
  incapacidades: { icono: Stethoscope, color: 'rose' },
  licencias: { icono: File, color: 'violet' },
  permisos: { icono: Clock, color: 'sky' },
  'horas-extra': { icono: ClockPlus, color: 'ink' },
  bonificaciones: { icono: CreditCard, color: 'ink' },
}

const fechaCorta = (iso: string) => formatFechaCorta(new Date(iso))

/** Insignia de origen autoservicio + enlace al soporte adjunto por el empleado. */
function OrigenSoporte({ autoservicio, docId }: { autoservicio: boolean; docId: string | null }) {
  if (!autoservicio && !docId) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      {autoservicio && <Badge variant="outline" className="text-[10px]">Autoservicio</Badge>}
      {docId && (
        <VisorPdf documentoId={docId} titulo="Soporte" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
          <Paperclip className="size-3.5" /> Soporte
        </VisorPdf>
      )}
    </div>
  )
}

/**
 * Buscador de novedades por persona (nombre, apellidos o documento), en el
 * encabezado. Filtra mientras se escribe; va por URL (`?q=`) y filtra todas
 * las pestañas.
 */
export function BuscadorNovedades({ tab, busqueda }: { tab: string; busqueda: string }) {
  const router = useRouter()
  // replace, no push: cada letra no debe quedar como un paso de "atrás".
  const buscar = (texto: string) => {
    const p = new URLSearchParams({ tab })
    if (texto.trim()) p.set('q', texto.trim())
    router.replace(`/novedades?${p}`, { scroll: false })
  }
  const [q, setQ] = useBusquedaEnVivo(busqueda, buscar)
  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground sm:left-3" />
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        // Corto: en el celular el buscador comparte la fila con el título.
        placeholder="Nombre o cédula"
        // El espacio de la X solo cuando hay texto: vacío, el texto guía necesita ese lugar.
        className={cn('h-8 pl-8 text-sm sm:h-9 sm:pl-9', q ? 'pr-8 sm:pr-9' : 'pr-2')}
        aria-label="Buscar novedades de una persona"
      />
      {q && (
        <button
          type="button"
          onClick={() => setQ('')}
          className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Quitar búsqueda"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}

export function NovedadesCliente({ tab, busqueda = '', datos, catalogos, puedeCrear, puedeEditar, puedeEliminar = false }: {
  tab: string; busqueda?: string; datos: Datos; catalogos: Catalogos; puedeCrear: boolean; puedeEditar: boolean; puedeEliminar?: boolean
}) {
  const [dialogo, setDialogo] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <FiltroTabs tabs={TABS.map((t) => ({ valor: t.v, label: t.l }))} activo={tab} basePath="/novedades" conservar={busqueda ? { q: busqueda } : undefined} />
        </div>
        {puedeCrear && tab === 'vacaciones' && (
          <Button size="sm" variant="outline" onClick={() => setDialogo('colectivas')} aria-label="Vacaciones colectivas" title="Vacaciones colectivas (toda la empresa, una sede o un área)">
            <Users className="size-4" /> <span className="hidden sm:inline">Colectivas</span>
          </Button>
        )}
        {puedeCrear && tab !== 'horas-extra' && <Button size="sm" onClick={() => setDialogo(tab)}><Plus className="size-4" /> Registrar</Button>}
      </div>

      {tab === 'vacaciones' && <ListaVacaciones items={datos.vacaciones} puedeEditar={puedeEditar} puedeEliminar={puedeEliminar} puedeCrear={puedeCrear} />}
      {tab === 'incapacidades' && <ListaIncapacidades items={datos.incapacidades} puedeEditar={puedeEditar} puedeEliminar={puedeEliminar} />}
      {tab === 'licencias' && <ListaLicencias items={datos.licencias} puedeEliminar={puedeEliminar} />}
      {tab === 'permisos' && <ListaPermisos items={datos.permisos} puedeEditar={puedeEditar} puedeEliminar={puedeEliminar} />}
      {tab === 'bonificaciones' && <ListaBonificaciones items={datos.bonificaciones} puedeEditar={puedeEditar} puedeEliminar={puedeEliminar} />}
      {tab === 'horas-extra' && <ListaAutorizaciones items={datos.horasExtra} puedeEditar={puedeEditar} puedeEliminar={puedeEliminar} />}

      {dialogo === 'incapacidades' && <DialogIncapacidad onClose={() => setDialogo(null)} />}
      {dialogo === 'colectivas' && <DialogColectivas catalogos={catalogos} onClose={() => setDialogo(null)} />}
      {dialogo && dialogo !== 'incapacidades' && dialogo !== 'colectivas' && <DialogRegistro tab={dialogo} onClose={() => setDialogo(null)} />}
    </div>
  )
}

/**
 * ListaAcordeon del kit con estado vacío de la pestaña. Compacta en el celular:
 * foto, nombre y sus etiquetas; la fecha y el motivo quedan en el detalle.
 */
function Lista(props: React.ComponentProps<typeof ListaAcordeon>) {
  if (props.items.length === 0) return <Vacio />
  return <ListaAcordeon compactoEnMovil {...props} />
}

/** Los botones del panel expandido, alineados a la derecha y sin desbordar en el celular. */
function FilaBotones({ children }: { children: React.ReactNode }) {
  return <div className="mt-2 flex flex-wrap justify-end gap-2">{children}</div>
}

function BotonEditar({ onClick, bloqueo }: { onClick: () => void; bloqueo?: string | null }) {
  return (
    <Button size="sm" variant="outline" onClick={onClick} title={bloqueo ?? 'Editar'}>
      <Pencil className="size-4" /> Editar
    </Button>
  )
}

function BotonAnular({ onClick, texto = 'Anular', icono = 'ban', bloqueo }: { onClick: () => void; texto?: string; icono?: 'ban' | 'trash'; bloqueo?: string | null }) {
  const Icono = icono === 'trash' ? Trash2 : Ban
  return (
    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={onClick} title={bloqueo ?? texto}>
      <Icono className="size-4" /> {texto}
    </Button>
  )
}

/**
 * Anular una novedad ya registrada, con el motivo: queda en auditoría, la
 * solicitud de origen pasa a anulada y al colaborador se le avisa.
 */
function DialogAnular({ titulo, detalle, desdeAutoservicio, verbo = 'Anular', exito = 'Anulado. Se le avisó al colaborador.', anular, onClose }: {
  titulo: string; detalle: string; desdeAutoservicio: boolean
  verbo?: string; exito?: string
  anular: (motivo: string) => Promise<{ ok: boolean; error?: string }>
  onClose: () => void
}) {
  const router = useRouter()
  const [motivo, setMotivo] = useState('')
  const [g, setG] = useState(false)

  async function confirmar() {
    setG(true)
    const res = await anular(motivo)
    setG(false)
    if (res.ok) { toast.success(exito); onClose(); router.refresh() } else toast.error(res.error ?? 'No se pudo anular.')
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !g && onClose()}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader><DialogTitle>{titulo}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          {detalle}{desdeAutoservicio ? ' · la solicitud del colaborador queda anulada' : ''}
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="motivo-anulacion">Motivo {obligatorio}</Label>
          <Textarea id="motivo-anulacion" rows={2} placeholder="¿Por qué se anula?" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={g}>Volver</Button>
          <Button variant="destructive" onClick={confirmar} disabled={g || motivo.trim().length < 5}>{g ? <Spinner /> : <Ban className="size-4" />} {verbo}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ─────────────────────────── Vacaciones ─────────────────────────── */

function ListaVacaciones({ items, puedeEditar, puedeEliminar, puedeCrear }: { items: Datos['vacaciones']; puedeEditar: boolean; puedeEliminar: boolean; puedeCrear: boolean }) {
  const [editando, setEditando] = useState<Vacacion | null>(null)
  const [anulando, setAnulando] = useState<Vacacion | null>(null)
  const [interrumpiendo, setInterrumpiendo] = useState<Vacacion | null>(null)
  const [reanudando, setReanudando] = useState<Vacacion | null>(null)
  return (
    <>
      <Lista
        chip={CHIP_NOV.vacaciones}
        items={items.map((x) => {
          const porEmpezar = x.estado === 'SOLICITADA' || x.estado === 'APROBADA'
          const bloqueo = x.pagadasAnticipado ? 'Una nómina ya las pagó por adelantado: solo si ese periodo no está cerrado' : !porEmpezar ? 'Solo se cambian o anulan las solicitadas o aprobadas; las que están en disfrute se interrumpen' : null
          return {
            id: x.id,
            titulo: x.colaborador,
            avatar: { colaboradorId: x.colaboradorId, fotoUrl: x.fotoUrl, nombre: x.colaborador },
            sub: `${fechaCorta(x.fechaInicio)} a ${fechaCorta(x.fechaFin)} · ${x.dias} días hábiles`,
            campos: [
              { label: 'Desde', valor: fechaCorta(x.fechaInicio) },
              { label: 'Hasta', valor: fechaCorta(x.fechaFin) },
              { label: 'Días hábiles', valor: String(x.dias) },
              { label: 'Estado', valor: ESTADO_VAC[x.estado] ?? x.estado },
              { label: 'Origen', valor: x.desdeAutoservicio ? 'Autoservicio' : 'Registro de RRHH' },
              ...(x.observaciones ? [{ label: 'Observaciones', valor: x.observaciones }] : []),
            ],
            derecha: (
              <div className="flex flex-wrap items-center gap-2">
                <OrigenSoporte autoservicio={x.desdeAutoservicio} docId={x.soporteDocId} />
                <Pill tone={TONO_ESTADO[x.estado] ?? 'muted'}>{ESTADO_VAC[x.estado]}</Pill>
              </div>
            ),
            extra: (puedeEditar || puedeEliminar || puedeCrear) && (
              <FilaBotones>
                {puedeEliminar && <BotonAnular onClick={() => setAnulando(x)} bloqueo={bloqueo} />}
                {puedeEditar && (x.estado === 'APROBADA' || x.estado === 'EN_DISFRUTE') && (
                  <Button size="sm" variant="outline" onClick={() => setInterrumpiendo(x)} title="Interrumpir por accidente, calamidad o fuerza mayor (RIT art. 36)">
                    <Pause className="size-4" /> Interrumpir
                  </Button>
                )}
                {puedeCrear && x.interrumpidas && (
                  <Button size="sm" variant="outline" onClick={() => setReanudando(x)} title="Programar los días que quedaron pendientes (RIT art. 36)">
                    <Play className="size-4" /> Reanudar
                  </Button>
                )}
                {puedeEditar && <BotonEditar onClick={() => setEditando(x)} bloqueo={bloqueo} />}
              </FilaBotones>
            ),
          }
        })}
      />
      {editando && <DialogRegistro tab="vacaciones" inicial={{ vacaciones: editando }} onClose={() => setEditando(null)} />}
      {anulando && (
        <DialogAnular
          titulo="Anular vacaciones"
          detalle={`${anulando.colaborador} · ${fechaCorta(anulando.fechaInicio)} a ${fechaCorta(anulando.fechaFin)} · ${anulando.dias} días hábiles vuelven al saldo`}
          desdeAutoservicio={anulando.desdeAutoservicio}
          anular={(motivo) => anularVacaciones({ id: anulando.id, motivo })}
          onClose={() => setAnulando(null)}
        />
      )}
      {interrumpiendo && <DialogInterrumpir vac={interrumpiendo} onClose={() => setInterrumpiendo(null)} />}
      {reanudando && <DialogReanudar vac={reanudando} onClose={() => setReanudando(null)} />}
    </>
  )
}

/** Interrupción justificada de vacaciones en curso (RIT art. 36): el resto vuelve al saldo. */
function DialogInterrumpir({ vac, onClose }: { vac: Vacacion; onClose: () => void }) {
  const router = useRouter()
  const [fecha, setFecha] = useState(vac.fechaInicio)
  const [motivo, setMotivo] = useState('')
  const [g, setG] = useState(false)

  async function confirmar() {
    setG(true)
    const res = await interrumpirVacaciones({ vacacionesId: vac.id, fechaInterrupcion: fecha, motivo: motivo.trim() })
    setG(false)
    if (!res.ok) { toast.error(res.error); return }
    const r = res.datos
    toast.success(`Interrumpidas. Disfrutó ${r.disfrutados} día(s); conserva ${r.restantes} para reanudar.`)
    onClose(); router.refresh()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !g && onClose()}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader><DialogTitle>Interrumpir vacaciones</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{vac.colaborador} · {fechaCorta(vac.fechaInicio)} a {fechaCorta(vac.fechaFin)}. Los días desde la interrupción vuelven al saldo para reanudarlos (RIT art. 36).</p>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="int-fecha">Fecha de interrupción {obligatorio}</Label>
            <Input id="int-fecha" type="date" min={vac.fechaInicio} max={vac.fechaFin} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="int-motivo">Motivo {obligatorio}</Label>
            <Textarea id="int-motivo" rows={2} placeholder="Accidente, calamidad doméstica, fuerza mayor…" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={g}>Cancelar</Button>
          <Button onClick={confirmar} disabled={g || !fecha || motivo.trim().length < 5}>{g ? <Spinner /> : <Pause className="size-4" />} Interrumpir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Reanudación de unas vacaciones interrumpidas (RIT art. 36): sin preaviso de 15 días. */
function DialogReanudar({ vac, onClose }: { vac: Vacacion; onClose: () => void }) {
  const router = useRouter()
  const [inicio, setInicio] = useState('')
  const [fin, setFin] = useState('')
  const [g, setG] = useState(false)

  async function confirmar() {
    setG(true)
    const res = await reanudarVacaciones({ vacacionesId: vac.id, fechaInicio: inicio, fechaFin: fin })
    setG(false)
    if (!res.ok) { toast.error(res.error); return }
    toast.success(`Reanudación programada: ${res.datos.dias} día(s) hábiles. Se le avisó al colaborador.`)
    onClose(); router.refresh()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !g && onClose()}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader><DialogTitle>Reanudar vacaciones</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{vac.colaborador} · interrumpidas el {fechaCorta(vac.fechaFin)}. Programa los días que quedaron pendientes; no aplica el preaviso de 15 días.</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label htmlFor="rea-inicio">Desde {obligatorio}</Label><Input id="rea-inicio" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="rea-fin">Hasta {obligatorio}</Label><Input id="rea-fin" type="date" value={fin} onChange={(e) => setFin(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={g}>Cancelar</Button>
          <Button onClick={confirmar} disabled={g || !inicio || !fin}>{g ? <Spinner /> : <Play className="size-4" />} Reanudar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Vacaciones colectivas (RIT art. 34): toda la empresa, una sede o un área, con preaviso de 15 días. */
function DialogColectivas({ catalogos, onClose }: { catalogos: Catalogos; onClose: () => void }) {
  const router = useRouter()
  const [alcance, setAlcance] = useState<'EMPRESA' | 'SEDE' | 'AREA'>('EMPRESA')
  const [sedeId, setSedeId] = useState('')
  const [areaId, setAreaId] = useState('')
  const [inicio, setInicio] = useState('')
  const [fin, setFin] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [g, setG] = useState(false)

  async function confirmar() {
    setG(true)
    const res = await registrarVacacionesColectivas({
      alcance, sedeId: alcance === 'SEDE' ? sedeId : undefined, areaId: alcance === 'AREA' ? areaId : undefined,
      fechaInicio: inicio, fechaFin: fin, observaciones: observaciones.trim() || undefined,
    })
    setG(false)
    if (!res.ok) { toast.error(res.error); return }
    const r = res.datos
    toast.success(`Vacaciones colectivas registradas: ${r.creados} persona(s) · ${r.dias} días hábiles${r.anticipados ? ` · ${r.anticipados} con días anticipados` : ''}${r.omitidos ? ` · ${r.omitidos} ya tenían vacaciones en esas fechas` : ''}.`, { duration: 8000 })
    onClose(); router.refresh()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !g && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Vacaciones colectivas</DialogTitle>
          <DialogDescription>Se programan a todos los colaboradores activos con vínculo laboral del alcance elegido y se les notifica (RIT art. 34, preaviso de 15 días hábiles).</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Sel label="Alcance" obligatorio value={alcance} onChange={(v) => setAlcance(v as 'EMPRESA')} opciones={[['EMPRESA', 'Toda la empresa'], ['SEDE', 'Una sede'], ['AREA', 'Un área']]} />
          {alcance === 'SEDE' && <Sel label="Sede" obligatorio value={sedeId} onChange={setSedeId} opciones={catalogos.sedes.map((s) => [s.id, s.nombre])} />}
          {alcance === 'AREA' && <Sel label="Área" obligatorio value={areaId} onChange={setAreaId} opciones={catalogos.areas.map((a) => [a.id, a.nombre])} />}
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Fecha inicio" obligatorio><Input type="date" min={minInicioVacaciones()} value={inicio} onChange={(e) => setInicio(e.target.value)} /></Campo>
            <Campo label="Fecha fin" obligatorio><Input type="date" value={fin} onChange={(e) => setFin(e.target.value)} /></Campo>
          </div>
          <Campo label="Observaciones"><Textarea rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} /></Campo>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={g}>Cancelar</Button>
          <Button onClick={confirmar} disabled={g || !inicio || !fin || (alcance === 'SEDE' && !sedeId) || (alcance === 'AREA' && !areaId)}>{g ? <Spinner /> : <Users className="size-4" />} Programar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ─────────────────────────── Bonificaciones ─────────────────────────── */

function ListaBonificaciones({ items, puedeEditar, puedeEliminar }: { items: Datos['bonificaciones']; puedeEditar: boolean; puedeEliminar: boolean }) {
  const router = useRouter()
  const [editando, setEditando] = useState<Bonificacion | null>(null)
  const [anulando, setAnulando] = useState<Bonificacion | null>(null)
  const [g, setG] = useState<string | null>(null)

  async function correr(id: string, fn: () => Promise<{ ok: boolean; error?: string }>, mensajeOk: string) {
    setG(id)
    const res = await fn()
    setG(null)
    if (res.ok) { toast.success(mensajeOk); router.refresh() } else toast.error(res.error)
  }

  return (
    <>
      <Lista
        chip={CHIP_NOV.bonificaciones}
        items={items.map((x) => {
          const pagada = x.estadoPago === 'PAGADO'
          const bloqueo = pagada ? (x.pagadaPorNomina ? 'La pagó una nómina: solo si ese periodo no está cerrado' : 'Ya está pagada: devuélvela a pendiente para editarla') : null
          return {
            id: x.id,
            titulo: x.colaborador,
            avatar: { colaboradorId: x.colaboradorId, fotoUrl: x.fotoUrl, nombre: x.colaborador },
            sub: `${x.concepto} · ${fmtCOP(x.valor)} · ${x.constitutivoSalario ? 'Constitutivo' : 'No constitutivo'}`,
            campos: [
              { label: 'Concepto', valor: x.concepto },
              { label: 'Valor', valor: fmtCOP(x.valor) },
              { label: 'Constitutivo de salario', valor: x.constitutivoSalario ? 'Sí' : 'No' },
              { label: 'Estado de pago', valor: pagada ? (x.pagadaPorNomina ? 'Pagada en nómina' : 'Pagada') : 'Pendiente' },
              ...(x.fechaPago ? [{ label: 'Fecha de pago', valor: fechaCorta(x.fechaPago) }] : []),
              ...(x.observaciones ? [{ label: 'Observaciones', valor: x.observaciones }] : []),
            ],
            derecha: pagada ? (
              <Pill tone="ok">Pagado {x.fechaPago ? fechaCorta(x.fechaPago) : ''}</Pill>
            ) : puedeEditar ? (
              <Button size="sm" disabled={g === x.id} onClick={() => correr(x.id, () => marcarBonificacionPagada({ id: x.id }), 'Marcada como pagada.')}>
                {g === x.id ? <Spinner /> : <CircleCheck className="size-4" />} Marcar pagada
              </Button>
            ) : <Pill tone="warn">Pendiente</Pill>,
            extra: (puedeEditar || puedeEliminar) && (
              <FilaBotones>
                {puedeEliminar && <BotonAnular onClick={() => setAnulando(x)} bloqueo={pagada && x.pagadaPorNomina ? bloqueo : null} />}
                {puedeEditar && pagada && (
                  <Button size="sm" variant="outline" disabled={g === x.id} title={x.pagadaPorNomina ? 'Solo si el periodo que la pagó no está cerrado' : 'Volver a dejarla pendiente'} onClick={() => correr(x.id, () => devolverBonificacionAPendiente({ id: x.id }), 'Vuelve a quedar pendiente.')}>
                    {g === x.id ? <Spinner /> : <RotateCcw className="size-4" />} Devolver a pendiente
                  </Button>
                )}
                {puedeEditar && <BotonEditar onClick={() => setEditando(x)} bloqueo={bloqueo} />}
              </FilaBotones>
            ),
          }
        })}
      />
      {editando && <DialogRegistro tab="bonificaciones" inicial={{ bonificacion: editando }} onClose={() => setEditando(null)} />}
      {anulando && (
        <DialogAnular
          titulo="Anular bonificación"
          detalle={`${anulando.colaborador} · ${anulando.concepto} · ${fmtCOP(anulando.valor)}`}
          desdeAutoservicio={false}
          exito="Anulada."
          anular={(motivo) => eliminarBonificacion({ id: anulando.id, motivo })}
          onClose={() => setAnulando(null)}
        />
      )}
    </>
  )
}

/* ─────────────────────────── Licencias ─────────────────────────── */

function ListaLicencias({ items, puedeEliminar }: { items: Datos['licencias']; puedeEliminar: boolean }) {
  const [anulando, setAnulando] = useState<Datos['licencias'][number] | null>(null)
  return (
    <>
      <Lista
        chip={CHIP_NOV.licencias}
        items={items.map((x) => ({
          id: x.id,
          titulo: x.colaborador,
          avatar: { colaboradorId: x.colaboradorId, fotoUrl: x.fotoUrl, nombre: x.colaborador },
          sub: `${TIPO_LIC[x.tipo]} · ${x.dias} días · ${x.remunerada ? 'Remunerada' : 'No remunerada'}`,
          campos: [
            { label: 'Tipo', valor: TIPO_LIC[x.tipo] ?? x.tipo },
            { label: 'Desde', valor: fechaCorta(x.fechaInicio) },
            { label: 'Hasta', valor: fechaCorta(x.fechaFin) },
            { label: 'Días', valor: String(x.dias) },
            { label: 'Remunerada', valor: x.remunerada ? 'Sí' : 'No' },
            { label: 'Origen', valor: x.desdeAutoservicio ? 'Autoservicio' : 'Registro de RRHH' },
          ],
          extra: puedeEliminar && <FilaBotones><BotonAnular onClick={() => setAnulando(x)} /></FilaBotones>,
        }))}
      />
      {anulando && (
        <DialogAnular
          titulo="Anular licencia"
          detalle={`${anulando.colaborador} · ${TIPO_LIC[anulando.tipo] ?? anulando.tipo} · ${fechaCorta(anulando.fechaInicio)} a ${fechaCorta(anulando.fechaFin)}`}
          desdeAutoservicio={anulando.desdeAutoservicio}
          anular={(motivo) => anularLicencia({ id: anulando.id, motivo })}
          onClose={() => setAnulando(null)}
        />
      )}
    </>
  )
}

/* ─────────────────────────── Permisos ─────────────────────────── */

function ListaPermisos({ items, puedeEditar, puedeEliminar }: { items: Datos['permisos']; puedeEditar: boolean; puedeEliminar: boolean }) {
  const [anulando, setAnulando] = useState<Permiso | null>(null)
  const [editando, setEditando] = useState<Permiso | null>(null)
  return (
    <>
    <Lista
      chip={CHIP_NOV.permisos}
      items={items.map((x) => {
        const et = ETIQUETA_COMPROBANTE[x.comprobante.situacion]
        return {
          id: x.id,
          titulo: x.colaborador,
          avatar: { colaboradorId: x.colaboradorId, fotoUrl: x.fotoUrl, nombre: x.colaborador },
          sub: `${fechaCorta(x.fecha)} · ${x.diaCompleto ? 'Día completo' : `${x.horas ?? 0} horas`} · ${x.motivo}`,
          campos: [
            { label: 'Fecha', valor: fechaCorta(x.fecha) },
            { label: 'Modalidad', valor: x.diaCompleto ? 'Día completo' : `Por horas (${x.horas ?? 0})${x.horaInicio && x.horaFin ? ` · ${x.horaInicio}–${x.horaFin}` : ''}` },
            { label: 'Remunerado', valor: x.remunerado ? 'Sí' : 'No' },
            ...(x.motivo ? [{ label: 'Motivo', valor: x.motivo }] : []),
            { label: 'Origen', valor: x.desdeAutoservicio ? 'Autoservicio' : 'Registro de RRHH' },
          ],
          derecha: (
            <div className="flex flex-wrap items-center gap-2">
              <OrigenSoporte autoservicio={x.desdeAutoservicio} docId={x.soporteDocId} />
              {x.comprobante.situacion !== 'NO_REQUERIDO' && (
                // En el celular, ícono + texto corto: así cabe en la línea de las otras etiquetas.
                <Pill tone={et.tone} className="inline-flex items-center gap-1">
                  <FileCheck className="size-3 sm:hidden" aria-hidden />
                  <span className="sm:hidden" title={et.label}>{et.corto}</span>
                  <span className="hidden sm:inline">{et.label}</span>
                </Pill>
              )}
            </div>
          ),
          extra: (
            <>
              <ComprobantePermiso permisoId={x.id} c={x.comprobante} puedeEditar={puedeEditar} />
              {(puedeEditar || puedeEliminar) && (
                <FilaBotones>
                  {puedeEliminar && <BotonAnular onClick={() => setAnulando(x)} />}
                  {puedeEditar && <BotonEditar onClick={() => setEditando(x)} />}
                </FilaBotones>
              )}
            </>
          ),
        }
      })}
    />
    {editando && <DialogRegistro tab="permisos" inicial={{ permiso: editando }} onClose={() => setEditando(null)} />}
    {anulando && (
      <DialogAnular
        titulo="Anular permiso"
        detalle={`${anulando.colaborador} · ${fechaCorta(anulando.fecha)} · ${anulando.diaCompleto ? 'Día completo' : `${anulando.horas ?? 0} horas`}`}
        desdeAutoservicio={anulando.desdeAutoservicio}
        anular={(motivo) => anularPermiso({ id: anulando.id, motivo })}
        onClose={() => setAnulando(null)}
      />
    )}
    </>
  )
}

/**
 * Comprobante de asistencia del permiso: situación, archivo y lo que Talento
 * Humano puede hacer con él (aceptarlo, devolverlo con motivo, pedirlo o dejar
 * de exigirlo).
 */
function ComprobantePermiso({ permisoId, c, puedeEditar }: { permisoId: string; c: ComprobanteNov; puedeEditar: boolean }) {
  const router = useRouter()
  const [g, setG] = useState(false)
  const [devolviendo, setDevolviendo] = useState(false)
  const [nota, setNota] = useState('')

  async function correr(fn: () => Promise<{ ok: boolean; error?: string }>, mensajeOk: string) {
    setG(true)
    const res = await fn()
    setG(false)
    if (res.ok) { toast.success(mensajeOk); setDevolviendo(false); setNota(''); router.refresh() } else toast.error(res.error ?? 'Error')
  }

  const et = ETIQUETA_COMPROBANTE[c.situacion]
  const descripcion: Record<SituacionComprobante, string> = {
    NO_REQUERIDO: 'A este permiso no se le pidió comprobante.',
    PENDIENTE: `El colaborador debe subirlo a más tardar el ${c.vence ?? '—'}.`,
    VENCIDO: `El plazo venció el ${c.vence ?? '—'} y el colaborador no lo ha subido.`,
    ENTREGADO: `Subido el ${c.entregadoEn ?? '—'}. Revisa el archivo y acéptalo o devuélvelo.`,
    VERIFICADO: 'Verificado por Talento Humano.',
  }

  return (
    <div className="rounded-lg border bg-card p-3 text-xs">
      {/* En pantallas anchas los botones van a la derecha del texto, no en una fila aparte. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <FileCheck className="size-4 shrink-0 text-muted-foreground" />
            <p className="text-[13px] font-medium">Comprobante de asistencia</p>
            <Pill tone={et.tone}>{et.label}</Pill>
            {c.docId && (
              <VisorPdf documentoId={c.docId} titulo="Comprobante de asistencia" className="inline-flex items-center gap-1 text-primary hover:underline">
                <Paperclip className="size-3.5" /> Ver archivo
              </VisorPdf>
            )}
          </div>
          <p className="mt-1 text-muted-foreground">{descripcion[c.situacion]}</p>
          {c.nota && (
            <p className="mt-1 text-muted-foreground">{c.situacion === 'VERIFICADO' ? 'Observación' : 'Devuelto'}: &ldquo;{c.nota}&rdquo;</p>
          )}
        </div>
        {puedeEditar && !devolviendo && (
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            {c.situacion === 'NO_REQUERIDO' && (
              <Button size="sm" disabled={g} onClick={() => correr(() => cambiarExigenciaComprobante({ permisoId, exigir: true }), 'Se le pidió el comprobante al colaborador.')}>
                {g ? <Spinner /> : <FileCheck className="size-4" />} Pedir comprobante
              </Button>
            )}
            {(c.situacion === 'PENDIENTE' || c.situacion === 'VENCIDO') && (
              <Button size="sm" disabled={g} onClick={() => correr(() => cambiarExigenciaComprobante({ permisoId, exigir: false }), 'Ya no se exige el comprobante.')}>
                {g ? <Spinner /> : <X className="size-4" />} Dejar de exigir
              </Button>
            )}
            {c.situacion === 'ENTREGADO' && (
              <>
                <Button size="sm" disabled={g} onClick={() => setDevolviendo(true)}>
                  <X className="size-4" /> No sirve
                </Button>
                <Button size="sm" disabled={g} onClick={() => correr(() => verificarComprobantePermiso({ permisoId, valido: true }), 'Comprobante verificado.')}>
                  {g ? <Spinner /> : <Check className="size-4" />} Aceptar
                </Button>
              </>
            )}
          </div>
        )}
      </div>
      {puedeEditar && devolviendo && (
        <div className="mt-2 space-y-2">
          <Textarea rows={2} placeholder="¿Por qué no sirve? El colaborador verá este motivo." value={nota} onChange={(e) => setNota(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setDevolviendo(false); setNota('') }}>Cancelar</Button>
            <Button
              size="sm" disabled={g || !nota.trim()}
              onClick={() => correr(() => verificarComprobantePermiso({ permisoId, valido: false, nota: nota.trim() }), 'Comprobante devuelto al colaborador.')}
            >
              {g ? <Spinner /> : <X className="size-4" />} Devolver
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────── Horas extra (autorizaciones) ─────────────────────────── */

function ListaAutorizaciones({ items, puedeEditar, puedeEliminar }: { items: Datos['horasExtra']; puedeEditar: boolean; puedeEliminar: boolean }) {
  const [editando, setEditando] = useState<Autorizacion | null>(null)
  const [anulando, setAnulando] = useState<Autorizacion | null>(null)
  return (
    <>
      <Lista
        chip={CHIP_NOV['horas-extra']}
        items={items.map((x) => ({
          id: x.id,
          titulo: x.colaborador,
          avatar: { colaboradorId: x.colaboradorId, fotoUrl: x.fotoUrl, nombre: x.colaborador },
          sub: `${fechaCorta(x.fecha)} · ${x.horaInicio}–${x.horaFin} · ${x.horas} h · ${x.motivo}`,
          campos: [
            { label: 'Fecha', valor: fechaCorta(x.fecha) },
            { label: 'Horario', valor: `${x.horaInicio}–${x.horaFin}` },
            { label: 'Horas', valor: String(x.horas) },
            { label: 'Pedidas', valor: x.posterior ? 'Después' : 'Antes' },
            { label: 'Motivo', valor: x.motivo },
          ],
          derecha: (
            <div className="flex flex-wrap items-center gap-2">
              <OrigenSoporte autoservicio docId={x.soporteDocId} />
              <Pill tone="ok">{x.horas} h</Pill>
            </div>
          ),
          extra: (puedeEditar || puedeEliminar) && (
            <FilaBotones>
              {puedeEliminar && <BotonAnular onClick={() => setAnulando(x)} />}
              {puedeEditar && <BotonEditar onClick={() => setEditando(x)} />}
            </FilaBotones>
          ),
        }))}
      />
      {editando && <DialogAutorizacion inicial={editando} onClose={() => setEditando(null)} />}
      {anulando && (
        <DialogAnular
          titulo="Anular autorización de horas extra"
          detalle={`${anulando.colaborador} · ${fechaCorta(anulando.fecha)} · ${anulando.horaInicio}–${anulando.horaFin} · ${anulando.horas} h`}
          desdeAutoservicio
          anular={(motivo) => eliminarAutorizacionHorasExtra({ id: anulando.id, motivo })}
          onClose={() => setAnulando(null)}
        />
      )}
    </>
  )
}

/** Editar una autorización de horas extra: fecha, horario (las horas salen de ahí) y motivo. */
function DialogAutorizacion({ inicial, onClose }: { inicial: Autorizacion; onClose: () => void }) {
  const router = useRouter()
  const [fecha, setFecha] = useState(inicial.fecha)
  const [horaInicio, setHoraInicio] = useState(inicial.horaInicio)
  const [horaFin, setHoraFin] = useState(inicial.horaFin)
  const [motivo, setMotivo] = useState(inicial.motivo)
  const [g, setG] = useState(false)

  async function guardar() {
    setG(true)
    const res = await editarAutorizacionHorasExtra({ id: inicial.id, fecha, horaInicio, horaFin, motivo: motivo.trim() })
    setG(false)
    if (!res.ok) { toast.error(res.error); return }
    toast.success(`Autorización actualizada: ${res.datos.horas} h.`)
    onClose(); router.refresh()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !g && onClose()}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader><DialogTitle>Editar horas extra · {inicial.colaborador}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <Campo label="Fecha" obligatorio><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Hora inicio" obligatorio><Input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} /></Campo>
            <Campo label="Hora fin" obligatorio><Input type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} /></Campo>
          </div>
          <Campo label="Motivo" obligatorio><Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Campo>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={g}>Cancelar</Button>
          <Button onClick={guardar} disabled={g || !fecha || !horaInicio || !horaFin || motivo.trim().length < 3}>{g && <Spinner />}Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Vacio() {
  return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Sin registros en esta categoría.</CardContent></Card>
}

/* ─────────────────────────── Registrar / editar ─────────────────────────── */

type Inicial = { vacaciones?: Vacacion; permiso?: Permiso; bonificacion?: Bonificacion }

/**
 * Registrar (sin `inicial`) o editar una vacación, licencia, permiso o
 * bonificación. Al editar no se cambia la persona.
 */
function DialogRegistro({ tab, inicial, onClose }: { tab: string; inicial?: Inicial; onClose: () => void }) {
  const router = useRouter()
  const ini = inicial?.vacaciones ?? inicial?.permiso ?? inicial?.bonificacion ?? null
  const editando = !!ini
  const [colaboradorId, setColaboradorId] = useState(ini?.colaboradorId ?? '')
  const [g, setG] = useState(false)
  const [campos, setCampos] = useState<Record<string, string | boolean>>({
    tipo: tab === 'licencias' ? 'NO_REMUNERADA' : '',
    remunerada: true, remunerado: inicial?.permiso?.remunerado ?? true, diaCompleto: inicial?.permiso?.diaCompleto ?? true,
    constitutivoSalario: inicial?.bonificacion?.constitutivoSalario ?? false, esProrroga: false, exigirComprobante: true,
    fechaInicio: inicial?.vacaciones?.fechaInicio ?? '', fechaFin: inicial?.vacaciones?.fechaFin ?? '',
    observaciones: inicial?.vacaciones?.observaciones ?? inicial?.bonificacion?.observaciones ?? '',
    fecha: inicial?.permiso?.fecha ?? '', horas: inicial?.permiso?.horas != null ? String(inicial.permiso.horas) : '',
    horaInicio: inicial?.permiso?.horaInicio ?? '', horaFin: inicial?.permiso?.horaFin ?? '', motivo: inicial?.permiso?.motivo ?? '',
    concepto: inicial?.bonificacion?.concepto ?? '', valor: inicial?.bonificacion ? String(Math.round(inicial.bonificacion.valor)) : '',
  })
  const set = (k: string, v: string | boolean) => setCampos((p) => ({ ...p, [k]: v }))

  async function guardar() {
    if (!editando && !colaboradorId) { toast.error('Selecciona un colaborador.'); return }
    setG(true)
    let res
    if (tab === 'vacaciones') {
      const datos = { fechaInicio: campos.fechaInicio as string, fechaFin: campos.fechaFin as string, observaciones: campos.observaciones as string }
      res = ini ? await editarVacaciones({ id: ini.id, ...datos }) : await registrarVacaciones({ colaboradorId, ...datos })
    } else if (tab === 'licencias') {
      res = await registrarLicencia({ colaboradorId, tipo: campos.tipo as 'NO_REMUNERADA', fechaInicio: campos.fechaInicio as string, fechaFin: campos.fechaFin as string, remunerada: campos.remunerada as boolean, observaciones: campos.observaciones as string })
    } else if (tab === 'permisos') {
      const datos = { fecha: campos.fecha as string, diaCompleto: campos.diaCompleto as boolean, horas: campos.horas ? Number(campos.horas) : undefined, motivo: campos.motivo as string, remunerado: campos.remunerado as boolean }
      res = ini
        ? await editarPermiso({ id: ini.id, ...datos, horaInicio: (campos.horaInicio as string) || '', horaFin: (campos.horaFin as string) || '' })
        : await registrarPermiso({ colaboradorId, ...datos, exigirComprobante: campos.exigirComprobante as boolean })
    } else {
      const datos = { concepto: campos.concepto as string, valor: Number(campos.valor || 0), constitutivoSalario: campos.constitutivoSalario as boolean, observaciones: campos.observaciones as string }
      res = ini ? await editarBonificacion({ id: ini.id, ...datos }) : await registrarBonificacion({ colaboradorId, ...datos })
    }
    setG(false)
    if (res?.ok) { toast.success(editando ? 'Novedad actualizada.' : 'Novedad registrada.'); onClose(); router.refresh() } else toast.error(res?.error ?? 'Error')
  }

  const titulos: Record<string, string> = { vacaciones: 'Registrar vacaciones', licencias: 'Registrar licencia', permisos: 'Registrar permiso', bonificaciones: 'Registrar bonificación' }
  const titulosEditar: Record<string, string> = { vacaciones: 'Editar vacaciones', permisos: 'Editar permiso', bonificaciones: 'Editar bonificación' }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>{editando ? `${titulosEditar[tab]} · ${ini!.colaborador}` : titulos[tab]}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {!editando && <div className="space-y-1.5"><Label>Colaborador {obligatorio}</Label><SelectorColaborador value={colaboradorId} onChange={(id) => setColaboradorId(id)} /></div>}

          {tab === 'licencias' && (
            <Sel label="Tipo" obligatorio value={campos.tipo as string} onChange={(v) => set('tipo', v)} opciones={Object.entries(TIPO_LIC)} />
          )}

          {(tab === 'vacaciones' || tab === 'licencias') && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Fecha inicio" obligatorio>
                  <Input type="date" min={tab === 'vacaciones' && !editando ? minInicioVacaciones() : undefined} value={campos.fechaInicio as string} onChange={(e) => set('fechaInicio', e.target.value)} />
                </Campo>
                <Campo label="Fecha fin" obligatorio><Input type="date" value={campos.fechaFin as string} onChange={(e) => set('fechaFin', e.target.value)} /></Campo>
              </div>
              {tab === 'vacaciones' && !editando && (
                <p className="text-xs text-muted-foreground">
                  La empresa debe notificar las vacaciones con al menos 15 días de anticipación (RIT art. 34).
                </p>
              )}
              {tab === 'vacaciones' && <Campo label="Observaciones"><Textarea rows={2} value={campos.observaciones as string} onChange={(e) => set('observaciones', e.target.value)} /></Campo>}
            </>
          )}
          {tab === 'permisos' && (
            <>
              <Campo label="Fecha" obligatorio><Input type="date" value={campos.fecha as string} onChange={(e) => set('fecha', e.target.value)} /></Campo>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={campos.diaCompleto as boolean} onCheckedChange={(v) => set('diaCompleto', Boolean(v))} /> Día completo</label>
              {!campos.diaCompleto && (
                editando ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <Campo label="Hora inicio"><Input type="time" value={campos.horaInicio as string} onChange={(e) => set('horaInicio', e.target.value)} /></Campo>
                      <Campo label="Hora fin"><Input type="time" value={campos.horaFin as string} onChange={(e) => set('horaFin', e.target.value)} /></Campo>
                    </div>
                    <Campo label="Horas"><Input type="number" step="0.5" value={campos.horas as string} onChange={(e) => set('horas', e.target.value)} placeholder="Si no hay horario, cuántas horas" /></Campo>
                  </>
                ) : (
                  <Campo label="Horas" obligatorio><Input type="number" step="0.5" value={campos.horas as string} onChange={(e) => set('horas', e.target.value)} /></Campo>
                )
              )}
              <Campo label="Motivo" obligatorio><Textarea rows={2} value={campos.motivo as string} onChange={(e) => set('motivo', e.target.value)} /></Campo>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={campos.remunerado as boolean} onCheckedChange={(v) => set('remunerado', Boolean(v))} /> Remunerado</label>
              {!editando && (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={campos.exigirComprobante as boolean} onCheckedChange={(v) => set('exigirComprobante', Boolean(v))} />
                  Pedir comprobante de asistencia
                </label>
              )}
            </>
          )}
          {tab === 'licencias' && (
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={campos.remunerada as boolean} onCheckedChange={(v) => set('remunerada', Boolean(v))} /> Remunerada</label>
          )}
          {tab === 'bonificaciones' && (
            <>
              <Campo label="Concepto" obligatorio><Input value={campos.concepto as string} onChange={(e) => set('concepto', e.target.value)} /></Campo>
              <Campo label="Valor" obligatorio><Input type="number" value={campos.valor as string} onChange={(e) => set('valor', e.target.value)} /></Campo>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={campos.constitutivoSalario as boolean} onCheckedChange={(v) => set('constitutivoSalario', Boolean(v))} /> Constitutivo de salario</label>
              <Campo label="Observaciones"><Textarea rows={2} value={campos.observaciones as string} onChange={(e) => set('observaciones', e.target.value)} /></Campo>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={g}>{g && <Spinner />}{editando ? 'Guardar' : 'Registrar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Mínimo para iniciar vacaciones registradas por la empresa: hoy + 15 días (RIT art. 34). */
function minInicioVacaciones(): string {
  const d = new Date()
  d.setDate(d.getDate() + 15)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function Campo({ label, obligatorio: req = false, children }: { label: string; obligatorio?: boolean; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label} {req && obligatorio}</Label>{children}</div>
}
function Sel({ label, obligatorio: req = false, value, onChange, opciones }: { label: string; obligatorio?: boolean; value: string; onChange: (v: string) => void; opciones: [string, string][] }) {
  return (
    <Campo label={label} obligatorio={req}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
        <SelectContent>{opciones.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
      </Select>
    </Campo>
  )
}
