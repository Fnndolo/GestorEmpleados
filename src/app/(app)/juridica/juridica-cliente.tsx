'use client'

import { reducirImagen } from '@/lib/reducir-imagen'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, FileText, Gavel, ShieldAlert, FileLock, History, Upload, Eye, Lock, Pencil, type LucideIcon } from 'lucide-react'
import { Chip, Pill, AvatarColaborador, type ChipColor, type PillTone } from '@/components/ui-kit'
import { urlFoto } from '@/lib/foto'
import { Button } from '@/components/ui/button'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SelectorColaborador } from '@/components/colaboradores/selector-colaborador'
import { FiltroTabs } from '@/components/shell/filtro-tabs'
import { etiquetaReporte } from '@/lib/linea-etica'
import { formatFechaCorta } from '@/lib/fechas'
import {
  crearDocumentoLegal, editarDocumentoLegal, eliminarDocumentoLegal, vincularVersionDocumentoLegal, crearProcesoDisciplinario, editarProcesoDisciplinario,
  crearConsultaReclamo, editarConsultaReclamo, eliminarConsultaReclamo, responderConsultaReclamo,
} from './acciones'
import { ZonaArchivos, DialogAnular, BotonAnular } from './_ui'

/** Sube un archivo asociado a una entidad usando el endpoint existente y devuelve el id del Documento. */
async function subirArchivoEntidad(entidadTipo: string, entidadId: string, file: File, nombre: string): Promise<string> {
  const fd = new FormData()
  fd.append('archivo', await reducirImagen(file))
  fd.append('entidadTipo', entidadTipo)
  fd.append('entidadId', entidadId)
  fd.append('nombre', nombre)
  const resp = await fetch('/api/documentos/subir', { method: 'POST', body: fd })
  const json = await resp.json()
  if (!resp.ok) throw new Error(json.error ?? 'No se pudo subir el archivo')
  return json.id as string
}

const inputArchivoCls = 'block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground'

const TABS = [
  { v: 'documentos', l: 'Documentos', i: FileText },
  { v: 'disciplinarios', l: 'Disciplinarios', i: Gavel },
  { v: 'denuncias', l: 'Línea ética', i: ShieldAlert },
  { v: 'habeas', l: 'Habeas data', i: FileLock },
]
const CAT_DOC: Record<string, string> = {
  REGLAMENTO_INTERNO: 'Reglamento interno', POLITICA: 'Política', CONVENIO_FINANCIERA: 'Convenio financiera',
  POLIZA: 'Póliza', ARRIENDO: 'Arriendo', MARCA: 'Marca', DOMINIO_WEB: 'Dominio web', LICENCIA_SOFTWARE: 'Licencia',
  ACUERDO_TRANSMISION_DATOS: 'Acuerdo transmisión datos', PERMISO_ESTABLECIMIENTO: 'Permiso establecimiento', OTRO: 'Otro',
}
const ETAPA: Record<string, string> = { CITACION_DESCARGOS: 'Citación a descargos', DESCARGOS: 'Descargos', DECISION: 'Decisión', RECURSO: 'Recurso', CERRADO: 'Cerrado' }
const EST_DEN: Record<string, string> = { RECIBIDA: 'Recibida', EN_INVESTIGACION: 'En investigación', RESUELTA: 'Resuelta', ARCHIVADA: 'Archivada' }

type VersionDoc = { version: number; vigente: boolean; archivoDocId: string | null; cambios: string | null; creadoEn: string }
type DocLegal = { id: string; categoria: string; titulo: string; descripcion: string | null; vigenciaFin: string | null; documentoId: string | null; versiones: VersionDoc[] }

type Consulta = {
  id: string; tipo: string; titular: string; estado: string; descripcion: string
  /** La radicó un colaborador desde su autoservicio (se le avisa si se anula). */
  desdeAutoservicio: boolean
  fechaRadicacion: string; fechaLimite: string | null; respuesta: string | null; respondidaEn: string | null
}
const ESTADO_HABEAS: Record<string, { label: string; tone: PillTone }> = {
  ABIERTO: { label: 'Por responder', tone: 'warn' }, EN_TRAMITE: { label: 'En trámite', tone: 'info' }, RESUELTO: { label: 'Respondida', tone: 'ok' },
}

type Props = {
  tab: string; puedeCrear: boolean; puedeEditar: boolean; puedeEliminar: boolean
  documentos: DocLegal[]
  disciplinarios: { id: string; colaborador: string; colaboradorId: string; fotoPath: string | null; asunto: string; etapa: string; cerrado: boolean }[]
  denuncias: { id: string; codigo: string; tipo: string; asunto: string | null; anonima: boolean; estado: string; fecha: string }[]
  consultas: Consulta[]
}

export function JuridicaCliente(p: Props) {
  const [dialogo, setDialogo] = useState<string | null>(null)
  const [consulta, setConsulta] = useState<Consulta | null>(null)
  const [editandoConsulta, setEditandoConsulta] = useState<Consulta | null>(null)
  const [eliminandoConsulta, setEliminandoConsulta] = useState<Consulta | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <FiltroTabs tabs={TABS.map((t) => ({ valor: t.v, label: t.l }))} activo={p.tab} basePath="/juridica" />
        </div>
        {/* Los reportes no se crean desde el admin: llegan por el autoservicio del colaborador (confidencial). */}
        {p.puedeCrear && p.tab !== 'denuncias' && <Button size="sm" onClick={() => setDialogo(p.tab)}><Plus className="size-4" /> Nuevo</Button>}
      </div>

      {p.tab === 'documentos' && <DocumentosLegales items={p.documentos} puedeCrear={p.puedeCrear} puedeEditar={p.puedeEditar} puedeEliminar={p.puedeEliminar} />}
      {p.tab === 'disciplinarios' && (
        <ListaLink
          vacio="Sin procesos disciplinarios."
          chip={{ icono: Gavel, color: 'violet' }}
          items={p.disciplinarios.map((d) => ({
            id: d.id, href: `/juridica/disciplinarios/${d.id}`, titulo: d.colaborador, sub: d.asunto,
            badge: ETAPA[d.etapa], tone: d.cerrado ? 'muted' as PillTone : 'warn' as PillTone,
            avatar: { nombre: d.colaborador, fotoUrl: urlFoto(d.colaboradorId, d.fotoPath, true) },
          }))}
        />
      )}
      {p.tab === 'denuncias' && (
        <>
          <div className="mb-3 flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
            <Lock className="mt-0.5 size-4 shrink-0" />
            <span>Los reportes llegan por la <strong>línea ética</strong> del autoservicio y son confidenciales: no se registra quién los envía. Aquí solo se gestionan (investigar, resolver, archivar). Los de acoso siguen el procedimiento del Comité de Convivencia (Ley 1010).</span>
          </div>
          <ListaLink
            vacio="Sin reportes."
            chip={{ icono: ShieldAlert, color: 'rose' }}
            items={p.denuncias.map((d) => ({
              id: d.id,
              href: `/juridica/denuncias/${d.id}`,
              // El tipo va en el título porque decide el procedimiento: no es lo
              // mismo atender un acoso que una sugerencia.
              titulo: `${d.asunto ? `${d.asunto} · ` : ''}${etiquetaReporte(d.tipo)} · ${d.codigo}${d.anonima ? ' (anónima)' : ''}`,
              sub: formatFechaCorta(new Date(d.fecha)),
              badge: EST_DEN[d.estado] ?? d.estado,
              tone: d.estado === 'RESUELTA' ? 'ok' : d.estado === 'ARCHIVADA' ? 'muted' : 'warn',
            }))}
          />
        </>
      )}
      {p.tab === 'habeas' && (
        p.consultas.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Sin consultas ni reclamos.</CardContent></Card>
        ) : (
          <Card><CardContent className="p-0 divide-y">
            {p.consultas.map((c) => {
              const est = ESTADO_HABEAS[c.estado] ?? { label: c.estado, tone: 'muted' as PillTone }
              const respondida = c.estado === 'RESUELTO'
              return (
                <div key={c.id} className="flex flex-wrap items-center gap-2 p-3 transition-colors hover:bg-accent/40">
                  <button type="button" onClick={() => setConsulta(c)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <Chip icono={FileLock} color="indigo" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.tipo === 'CONSULTA' ? 'Consulta' : 'Reclamo'} — {c.titular}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        Radicada {formatFechaCorta(new Date(c.fechaRadicacion))}
                        {respondida && c.respondidaEn ? ` · respondida ${formatFechaCorta(new Date(c.respondidaEn))}` : c.fechaLimite ? ` · responder antes del ${formatFechaCorta(new Date(c.fechaLimite))}` : ''}
                      </p>
                    </div>
                  </button>
                  <Pill tone={est.tone}>{est.label}</Pill>
                  {p.puedeEditar && (
                    <Button
                      size="icon" variant="ghost" aria-label="Editar" title={respondida ? 'Ya fue respondida: no se modifica' : 'Editar'}
                      className={respondida ? 'opacity-60' : undefined}
                      onClick={() => (respondida ? toast.error('Esta solicitud ya fue respondida: no se modifica. Si hay un error, anúlala y regístrala de nuevo.') : setEditandoConsulta(c))}
                    >
                      <Pencil className="size-4" />
                    </Button>
                  )}
                  {p.puedeEliminar && <BotonAnular soloIcono onClick={() => setEliminandoConsulta(c)} />}
                </div>
              )
            })}
          </CardContent></Card>
        )
      )}
      {consulta && <DialogRespuesta consulta={consulta} puedeEditar={p.puedeEditar} onClose={() => setConsulta(null)} />}
      {editandoConsulta && <DialogConsulta inicial={editandoConsulta} onClose={() => setEditandoConsulta(null)} />}
      {eliminandoConsulta && (
        <DialogAnular
          titulo={`Anular ${eliminandoConsulta.tipo === 'CONSULTA' ? 'consulta' : 'reclamo'} de habeas data`}
          detalle={`${eliminandoConsulta.titular} · radicada ${formatFechaCorta(new Date(eliminandoConsulta.fechaRadicacion))}${eliminandoConsulta.desdeAutoservicio ? ' · se le avisa al colaborador que la radicó' : ''}`}
          anular={(motivo) => eliminarConsultaReclamo({ id: eliminandoConsulta.id, motivo })}
          onClose={() => setEliminandoConsulta(null)}
        />
      )}

      {dialogo === 'documentos' && <DialogDocumento onClose={() => setDialogo(null)} />}
      {dialogo === 'disciplinarios' && <DialogDisciplinario onClose={() => setDialogo(null)} />}
      {dialogo === 'habeas' && <DialogConsulta onClose={() => setDialogo(null)} />}
    </div>
  )
}

type ChipDef = { icono: LucideIcon; color: ChipColor }

function ListaLink({ items, vacio, chip }: {
  items: {
    id: string; href: string; titulo: string; sub: string; badge: string; tone: PillTone
    /** Foto del colaborador dueño del registro, cuando lo hay (p. ej. disciplinarios: NO en
     * denuncias, que son confidenciales y no llevan a nadie asociado). */
    avatar?: { nombre: string; fotoUrl: string | null }
  }[]
  vacio: string
  chip?: ChipDef
}) {
  if (items.length === 0) return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{vacio}</CardContent></Card>
  return (
    <Card><CardContent className="p-0 divide-y">
      {items.map((i) => (
        <Link key={i.id} href={i.href} className="flex flex-wrap items-center gap-3 p-3 transition-colors hover:bg-accent/40">
          {i.avatar ? (
            <AvatarColaborador nombre={i.avatar.nombre} fotoUrl={i.avatar.fotoUrl} />
          ) : (
            chip && <Chip icono={chip.icono} color={chip.color} />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{i.titulo}</p>
            <p className="truncate text-xs text-muted-foreground">{i.sub}</p>
          </div>
          <Pill tone={i.tone}>{i.badge}</Pill>
        </Link>
      ))}
    </CardContent></Card>
  )
}

function Campo({ label, obligatorio, children }: { label: string; obligatorio?: boolean; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}{obligatorio && <span className="text-destructive"> *</span>}</Label>{children}</div>
}

/** Leer una consulta o reclamo y responderla; respondida, muestra la respuesta y su fecha. */
function DialogRespuesta({ consulta, puedeEditar, onClose }: { consulta: Consulta; puedeEditar: boolean; onClose: () => void }) {
  const router = useRouter()
  const [respuesta, setRespuesta] = useState('')
  const [g, setG] = useState(false)
  const respondida = consulta.estado === 'RESUELTO'

  async function responder() {
    if (respuesta.trim().length < 5) { toast.error('Escribe la respuesta.'); return }
    setG(true)
    const res = await responderConsultaReclamo({ id: consulta.id, respuesta })
    setG(false)
    if (res.ok) { toast.success('Respuesta enviada. El colaborador la verá en su autoservicio.'); onClose(); router.refresh() }
    else toast.error(res.error)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{consulta.tipo === 'CONSULTA' ? 'Consulta' : 'Reclamo'} de {consulta.titular}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">
            Radicada {formatFechaCorta(new Date(consulta.fechaRadicacion))}
            {consulta.fechaLimite ? ` · plazo hasta el ${formatFechaCorta(new Date(consulta.fechaLimite))}` : ''}
          </p>
          <div className="rounded-lg border bg-muted/30 p-3 whitespace-pre-wrap">{consulta.descripcion}</div>
          {respondida ? (
            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Respuesta{consulta.respondidaEn ? ` · ${formatFechaCorta(new Date(consulta.respondidaEn))}` : ''}
              </p>
              <div className="rounded-lg border p-3 whitespace-pre-wrap">{consulta.respuesta}</div>
            </div>
          ) : puedeEditar ? (
            <Campo label="Respuesta">
              <Textarea rows={5} value={respuesta} onChange={(e) => setRespuesta(e.target.value)} placeholder="Qué datos se tienen, qué se corrigió o eliminó, o por qué no procede." />
            </Campo>
          ) : (
            <p className="text-xs text-muted-foreground">Pendiente de respuesta.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{respondida || !puedeEditar ? 'Cerrar' : 'Cancelar'}</Button>
          {!respondida && puedeEditar && (
            <Button onClick={responder} disabled={g}>{g && <Spinner />}Enviar respuesta</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DocumentosLegales({ items, puedeCrear, puedeEditar, puedeEliminar }: { items: DocLegal[]; puedeCrear: boolean; puedeEditar: boolean; puedeEliminar: boolean }) {
  if (items.length === 0) return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Sin documentos legales.</CardContent></Card>
  return <div className="space-y-2">{items.map((d) => <DocumentoLegalItem key={d.id} d={d} puedeCrear={puedeCrear} puedeEditar={puedeEditar} puedeEliminar={puedeEliminar} />)}</div>
}

function DocumentoLegalItem({ d, puedeCrear, puedeEditar, puedeEliminar }: { d: DocLegal; puedeCrear: boolean; puedeEditar: boolean; puedeEliminar: boolean }) {
  const [verVersiones, setVerVersiones] = useState(false)
  const [nuevaVersion, setNuevaVersion] = useState(false)
  const [editar, setEditar] = useState(false)
  const [eliminar, setEliminar] = useState(false)
  const [verDoc, setVerDoc] = useState<{ id: string; titulo: string } | null>(null)
  const vigente = d.versiones.find((x) => x.vigente)
  return (
    <Card><CardContent className="py-3">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <Chip icono={FileText} color="teal" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm truncate">{d.titulo}</p>
          <p className="text-xs text-muted-foreground">
            {CAT_DOC[d.categoria]}
            {d.vigenciaFin ? ` · vence ${formatFechaCorta(new Date(d.vigenciaFin))}` : ''}
            {vigente ? ` · v${vigente.version}` : ' · sin archivo'}
          </p>
        </div>
        {d.documentoId && (
          <Button size="sm" onClick={() => setVerDoc({ id: d.documentoId as string, titulo: d.titulo })}><Eye className="size-4" /> Ver</Button>
        )}
        {d.versiones.length > 1 && (
          <Button variant="ghost" size="icon" onClick={() => setVerVersiones((v) => !v)} aria-label="Historial de versiones"><History className="size-4" /></Button>
        )}
        {puedeCrear && (
          <Button size="sm" onClick={() => setNuevaVersion(true)} aria-label="Nueva versión" title="Nueva versión"><Upload className="size-4" /> <span className="hidden sm:inline">Nueva versión</span></Button>
        )}
        {puedeEditar && (
          <Button variant="ghost" size="icon" onClick={() => setEditar(true)} aria-label="Editar" title="Editar"><Pencil className="size-4" /></Button>
        )}
        {puedeEliminar && <BotonAnular soloIcono verbo="Eliminar" onClick={() => setEliminar(true)} />}
      </div>
      {editar && <DialogDocumento inicial={d} onClose={() => setEditar(false)} />}
      {eliminar && (
        <DialogAnular
          verbo="Eliminar"
          titulo="Eliminar documento legal"
          detalle={`${d.titulo} · ${CAT_DOC[d.categoria]}${d.versiones.length ? ` · se borran sus ${d.versiones.length} versión(es) y archivos` : ''}`}
          anular={(motivo) => eliminarDocumentoLegal({ id: d.id, motivo })}
          onClose={() => setEliminar(false)}
        />
      )}
      {verVersiones && d.versiones.length > 0 && (
        <div className="mt-2 border-t pt-2 space-y-1">
          {d.versiones.map((ver) => (
            <div key={ver.version} className="flex items-center gap-2 text-xs">
              <Pill tone={ver.vigente ? 'ok' : 'muted'}>v{ver.version}{ver.vigente ? ' · vigente' : ''}</Pill>
              <span className="text-muted-foreground truncate">{ver.creadoEn}{ver.cambios ? ` · ${ver.cambios}` : ''}</span>
              {ver.archivoDocId && <button type="button" onClick={() => setVerDoc({ id: ver.archivoDocId as string, titulo: `${d.titulo} · v${ver.version}` })} className="text-primary hover:underline ml-auto shrink-0">Ver</button>}
            </div>
          ))}
        </div>
      )}
      {nuevaVersion && <DialogNuevaVersion documentoLegalId={d.id} titulo={d.titulo} onClose={() => setNuevaVersion(false)} />}
      {verDoc && <VisorDocumento documentoId={verDoc.id} titulo={verDoc.titulo} onClose={() => setVerDoc(null)} />}
    </CardContent></Card>
  )
}

/** El visor compartido de documentos: PDF o foto, con acercar, descargar y abrir aparte. */
function VisorDocumento({ documentoId, titulo, onClose }: { documentoId: string; titulo: string; onClose: () => void }) {
  return <VisorPdf documentoId={documentoId} titulo={titulo} abierto onAbiertoChange={(v) => { if (!v) onClose() }} />
}

function DialogNuevaVersion({ documentoLegalId, titulo, onClose }: { documentoLegalId: string; titulo: string; onClose: () => void }) {
  const router = useRouter()
  const [archivo, setArchivo] = useState<File | null>(null)
  const [cambios, setCambios] = useState('')
  const [g, setG] = useState(false)
  async function guardar() {
    if (!archivo) { toast.error('Selecciona el archivo.'); return }
    setG(true)
    try {
      const docId = await subirArchivoEntidad('DocumentoLegal', documentoLegalId, archivo, titulo)
      const res = await vincularVersionDocumentoLegal({ documentoLegalId, documentoId: docId, cambios: cambios || undefined })
      if (!res.ok) throw new Error(res.error)
      toast.success('Nueva versión guardada.'); onClose(); router.refresh()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo guardar.') } finally { setG(false) }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent>
      <DialogHeader><DialogTitle>Nueva versión — {titulo}</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <Campo label="Archivo (PDF/imagen)"><input type="file" accept="image/*,application/pdf" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} className={inputArchivoCls} /></Campo>
        <Campo label="¿Qué cambió? (opcional)"><Textarea rows={2} value={cambios} onChange={(e) => setCambios(e.target.value)} /></Campo>
      </div>
      <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={guardar} disabled={g || !archivo}>{g && <Spinner />}Guardar versión</Button></DialogFooter>
    </DialogContent></Dialog>
  )
}

/** Crear un documento legal o, con `inicial`, corregir sus datos (las versiones no se tocan aquí). */
function DialogDocumento({ inicial, onClose }: { inicial?: DocLegal; onClose: () => void }) {
  const router = useRouter()
  const [f, setF] = useState<Record<string, string>>({
    categoria: inicial?.categoria ?? 'POLITICA', titulo: inicial?.titulo ?? '', descripcion: inicial?.descripcion ?? '', vigenciaFin: inicial?.vigenciaFin ?? '',
  })
  const [archivo, setArchivo] = useState<File | null>(null)
  const [g, setG] = useState(false)
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))
  async function guardar() {
    if (!f.titulo || f.titulo.trim().length < 2) { toast.error('Escribe el título.'); return }
    setG(true)
    try {
      if (inicial) {
        const res = await editarDocumentoLegal({ id: inicial.id, categoria: f.categoria as 'POLITICA', titulo: f.titulo, descripcion: f.descripcion, vigenciaFin: f.vigenciaFin })
        if (!res.ok) throw new Error(res.error)
        toast.success('Documento actualizado.'); onClose(); router.refresh()
        return
      }
      const res = await crearDocumentoLegal({ categoria: f.categoria as 'POLITICA', titulo: f.titulo, descripcion: f.descripcion, vigenciaFin: f.vigenciaFin })
      if (!res.ok) throw new Error(res.error)
      const id = (res.datos as { id: string }).id
      if (archivo) {
        const docId = await subirArchivoEntidad('DocumentoLegal', id, archivo, f.titulo)
        const rv = await vincularVersionDocumentoLegal({ documentoLegalId: id, documentoId: docId, cambios: 'Versión inicial' })
        if (!rv.ok) throw new Error(rv.error)
      }
      toast.success('Documento registrado.'); onClose(); router.refresh()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo guardar.') } finally { setG(false) }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent>
      <DialogHeader><DialogTitle>{inicial ? 'Editar documento legal' : 'Nuevo documento legal'}</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <Campo label="Categoría" obligatorio>
          <Select value={f.categoria} onValueChange={(v) => set('categoria', v)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(CAT_DOC).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select>
        </Campo>
        <Campo label="Título" obligatorio><Input value={f.titulo} onChange={(e) => set('titulo', e.target.value)} /></Campo>
        <Campo label="Descripción"><Textarea rows={2} value={f.descripcion} onChange={(e) => set('descripcion', e.target.value)} /></Campo>
        <Campo label="Vigencia hasta">
          <Input type="date" value={f.vigenciaFin} onChange={(e) => set('vigenciaFin', e.target.value)} />
          <p className="text-xs text-muted-foreground">Si se indica, genera la alerta de vencimiento.</p>
        </Campo>
        {!inicial && <Campo label="Archivo PDF"><input type="file" accept="image/*,application/pdf" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} className={inputArchivoCls} /></Campo>}
      </div>
      <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={guardar} disabled={g}>{g && <Spinner />}{inicial ? 'Guardar cambios' : 'Registrar'}</Button></DialogFooter>
    </DialogContent></Dialog>
  )
}

/** Lo que se precarga al editar un expediente (asunto, descripción y fecha de apertura). */
export type ProcesoInicial = { id: string; clase: string; asunto: string; descripcion: string | null; fechaApertura: string }

/** Abrir un proceso disciplinario o, con `inicial`, corregir el asunto, la descripción o la fecha de apertura de uno abierto. */
export function DialogDisciplinario({ inicial, onClose }: { inicial?: ProcesoInicial; onClose: () => void }) {
  const router = useRouter()
  const [colaboradorId, setColaboradorId] = useState('')
  const [f, setF] = useState<Record<string, string>>({
    asunto: inicial?.asunto ?? '', descripcion: inicial?.descripcion ?? '',
    fechaApertura: inicial?.fechaApertura ?? new Date().toISOString().slice(0, 10),
  })
  const [archivos, setArchivos] = useState<File[]>([])
  const [g, setG] = useState(false)
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))
  async function guardar() {
    if (!inicial && !colaboradorId) { toast.error('Selecciona un colaborador.'); return }
    if (!f.asunto || f.asunto.trim().length < 3) { toast.error('Escribe el asunto.'); return }
    if (!f.fechaApertura) { toast.error('Indica la fecha de apertura.'); return }
    setG(true)
    try {
      if (inicial) {
        const res = await editarProcesoDisciplinario({ procesoId: inicial.id, asunto: f.asunto, descripcion: f.descripcion, fechaApertura: f.fechaApertura })
        if (!res.ok) throw new Error(res.error)
        toast.success('Expediente actualizado.'); onClose(); router.refresh()
        return
      }
      // Desde Jurídica se abre el proceso completo: los llamados de atención
      // se registran desde la ficha del colaborador, donde está su historial.
      const res = await crearProcesoDisciplinario({ colaboradorId, clase: 'PROCESO', asunto: f.asunto, descripcion: f.descripcion, fechaApertura: f.fechaApertura })
      if (!res.ok) throw new Error(res.error)
      const { id, etapaId } = res.datos as { id: string; etapaId: string }
      // Los soportes iniciales quedan anclados a la etapa de apertura (no editables después)
      for (const file of archivos) {
        await subirArchivoEntidad('EtapaProceso', etapaId, file, file.name)
      }
      toast.success('Proceso abierto.'); onClose(); router.push(`/juridica/disciplinarios/${id}`)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo guardar.') } finally { setG(false) }
  }
  const titulo = inicial ? `Editar ${inicial.clase === 'LLAMADO_ATENCION' ? 'llamado de atención' : 'proceso disciplinario'}` : 'Abrir proceso disciplinario'
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent>
      <DialogHeader><DialogTitle>{titulo}</DialogTitle></DialogHeader>
      <div className="space-y-4">
        {!inicial && <Campo label="Colaborador" obligatorio><SelectorColaborador value={colaboradorId} onChange={(id) => setColaboradorId(id)} /></Campo>}
        <Campo label="Asunto" obligatorio><Input value={f.asunto} onChange={(e) => set('asunto', e.target.value)} /></Campo>
        <Campo label="Descripción"><Textarea rows={2} value={f.descripcion} onChange={(e) => set('descripcion', e.target.value)} /></Campo>
        <Campo label="Fecha de apertura" obligatorio><Input type="date" value={f.fechaApertura} onChange={(e) => set('fechaApertura', e.target.value)} /></Campo>
        {!inicial && (
          <Campo label="Soportes de prueba (puedes adjuntar varios: imágenes, PDF o video)">
            <ZonaArchivos archivos={archivos} onChange={setArchivos} accept="image/*,application/pdf,video/*" />
          </Campo>
        )}
      </div>
      <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={guardar} disabled={g}>{g && <Spinner />}{inicial ? 'Guardar cambios' : 'Abrir'}</Button></DialogFooter>
    </DialogContent></Dialog>
  )
}

/** Registrar una consulta/reclamo de un tercero o, con `inicial`, corregir una ya registrada (el plazo se recalcula). */
function DialogConsulta({ inicial, onClose }: { inicial?: Consulta; onClose: () => void }) {
  const router = useRouter()
  const [f, setF] = useState<Record<string, string>>({
    tipo: inicial?.tipo ?? 'CONSULTA', titular: inicial?.titular ?? '', descripcion: inicial?.descripcion ?? '',
    fechaRadicacion: inicial?.fechaRadicacion ?? new Date().toISOString().slice(0, 10),
  })
  const [g, setG] = useState(false)
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))
  async function guardar() {
    if (f.titular.trim().length < 2) { toast.error('Escribe el titular de los datos.'); return }
    if (f.descripcion.trim().length < 5) { toast.error('Describe la consulta o el reclamo.'); return }
    setG(true)
    const datos = { tipo: f.tipo as 'CONSULTA', titular: f.titular, descripcion: f.descripcion, fechaRadicacion: f.fechaRadicacion }
    const res = inicial ? await editarConsultaReclamo({ id: inicial.id, ...datos }) : await crearConsultaReclamo(datos)
    setG(false)
    if (res.ok) { toast.success(inicial ? 'Actualizado. El plazo se recalculó.' : 'Registrado.'); onClose(); router.refresh() } else toast.error(res.error)
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent>
      <DialogHeader>
        <DialogTitle>{inicial ? 'Editar consulta o reclamo' : 'Consulta o reclamo de un tercero'}</DialogTitle>
        {!inicial && <DialogDescription>Para titulares SIN autoservicio (ex-empleados, clientes). Los colaboradores activos lo radican desde su propio autoservicio.</DialogDescription>}
      </DialogHeader>
      <div className="space-y-4">
        <Campo label="Tipo" obligatorio>
          <Select value={f.tipo} onValueChange={(v) => set('tipo', v)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="CONSULTA">Consulta (10 días hábiles)</SelectItem><SelectItem value="RECLAMO">Reclamo (15 días hábiles)</SelectItem></SelectContent></Select>
        </Campo>
        <Campo label="Titular de los datos" obligatorio><Input value={f.titular} onChange={(e) => set('titular', e.target.value)} /></Campo>
        <Campo label="Descripción" obligatorio><Textarea rows={3} value={f.descripcion} onChange={(e) => set('descripcion', e.target.value)} /></Campo>
        <Campo label="Fecha de radicación" obligatorio><Input type="date" value={f.fechaRadicacion} onChange={(e) => set('fechaRadicacion', e.target.value)} /></Campo>
      </div>
      <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={guardar} disabled={g}>{g && <Spinner />}{inicial ? 'Guardar cambios' : 'Registrar'}</Button></DialogFooter>
    </DialogContent></Dialog>
  )
}
