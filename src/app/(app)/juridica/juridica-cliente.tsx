'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, FileText, Gavel, ShieldAlert, FileLock, History, Upload, Eye, ExternalLink, Lock, type LucideIcon } from 'lucide-react'
import { Chip, Pill, type ChipColor, type PillTone } from '@/components/ui-kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SelectorColaborador } from '@/components/colaboradores/selector-colaborador'
import { FiltroTabs } from '@/components/shell/filtro-tabs'
import { formatFechaCorta } from '@/lib/fechas'
import { crearDocumentoLegal, vincularVersionDocumentoLegal, crearProcesoDisciplinario, crearConsultaReclamo } from './acciones'
import { ZonaArchivos } from './_ui'

/** Sube un archivo asociado a una entidad usando el endpoint existente y devuelve el id del Documento. */
async function subirArchivoEntidad(entidadTipo: string, entidadId: string, file: File, nombre: string): Promise<string> {
  const fd = new FormData()
  fd.append('archivo', file, file.name)
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
  { v: 'denuncias', l: 'Anti-acoso', i: ShieldAlert },
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
type DocLegal = { id: string; categoria: string; titulo: string; vigenciaFin: string | null; documentoId: string | null; versiones: VersionDoc[] }

type Props = {
  tab: string; puedeCrear: boolean; puedeEditar: boolean
  documentos: DocLegal[]
  disciplinarios: { id: string; colaborador: string; asunto: string; etapa: string; cerrado: boolean }[]
  denuncias: { id: string; codigo: string; anonima: boolean; estado: string; fecha: string }[]
  consultas: { id: string; tipo: string; titular: string; estado: string; fechaLimite: string | null }[]
}

export function JuridicaCliente(p: Props) {
  const [dialogo, setDialogo] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <FiltroTabs tabs={TABS.map((t) => ({ valor: t.v, label: t.l }))} activo={p.tab} basePath="/juridica" />
        </div>
        {/* Anti-acoso ya no se crea desde el admin: llega por el autoservicio del colaborador (confidencial). */}
        {p.puedeCrear && p.tab !== 'denuncias' && <Button size="sm" onClick={() => setDialogo(p.tab)}><Plus className="size-4" /> Nuevo</Button>}
      </div>

      {p.tab === 'documentos' && <DocumentosLegales items={p.documentos} puedeCrear={p.puedeCrear} />}
      {p.tab === 'disciplinarios' && (
        <ListaLink
          vacio="Sin procesos disciplinarios."
          chip={{ icono: Gavel, color: 'violet' }}
          items={p.disciplinarios.map((d) => ({ id: d.id, href: `/juridica/disciplinarios/${d.id}`, titulo: d.colaborador, sub: d.asunto, badge: ETAPA[d.etapa], tone: d.cerrado ? 'muted' : 'warn' }))}
        />
      )}
      {p.tab === 'denuncias' && (
        <>
          <div className="mb-3 flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
            <Lock className="mt-0.5 size-4 shrink-0" />
            <span>Las denuncias llegan por el <strong>canal de autoservicio</strong> del colaborador y son confidenciales: no se registra quién las envía. Aquí solo se gestionan (investigar, resolver, archivar).</span>
          </div>
          <ListaLink
            vacio="Sin denuncias."
            chip={{ icono: ShieldAlert, color: 'rose' }}
            items={p.denuncias.map((d) => ({ id: d.id, href: `/juridica/denuncias/${d.id}`, titulo: `${d.codigo}${d.anonima ? ' (anónima)' : ''}`, sub: formatFechaCorta(new Date(d.fecha)), badge: EST_DEN[d.estado] ?? d.estado, tone: d.estado === 'RESUELTA' ? 'ok' : d.estado === 'ARCHIVADA' ? 'muted' : 'warn' }))}
          />
        </>
      )}
      {p.tab === 'habeas' && (
        <Lista
          vacio="Sin consultas ni reclamos."
          chip={{ icono: FileLock, color: 'indigo' }}
          items={p.consultas.map((c) => ({ id: c.id, titulo: `${c.tipo} — ${c.titular}`, sub: `${c.estado}${c.fechaLimite ? ` · límite ${formatFechaCorta(new Date(c.fechaLimite))} (días hábiles)` : ''}` }))}
        />
      )}

      {dialogo === 'documentos' && <DialogDocumento onClose={() => setDialogo(null)} />}
      {dialogo === 'disciplinarios' && <DialogDisciplinario onClose={() => setDialogo(null)} />}
      {dialogo === 'habeas' && <DialogConsulta onClose={() => setDialogo(null)} />}
    </div>
  )
}

type ChipDef = { icono: LucideIcon; color: ChipColor }

function Lista({ items, vacio, chip }: { items: { id: string; titulo: string; sub: string }[]; vacio: string; chip?: ChipDef }) {
  if (items.length === 0) return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{vacio}</CardContent></Card>
  return (
    <Card><CardContent className="p-0 divide-y">
      {items.map((i) => (
        <div key={i.id} className="flex items-center gap-3 p-3">
          {chip && <Chip icono={chip.icono} color={chip.color} />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{i.titulo}</p>
            <p className="truncate text-xs text-muted-foreground">{i.sub}</p>
          </div>
        </div>
      ))}
    </CardContent></Card>
  )
}
function ListaLink({ items, vacio, chip }: { items: { id: string; href: string; titulo: string; sub: string; badge: string; tone: PillTone }[]; vacio: string; chip?: ChipDef }) {
  if (items.length === 0) return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{vacio}</CardContent></Card>
  return (
    <Card><CardContent className="p-0 divide-y">
      {items.map((i) => (
        <Link key={i.id} href={i.href} className="flex items-center gap-3 p-3 transition-colors hover:bg-accent/40">
          {chip && <Chip icono={chip.icono} color={chip.color} />}
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

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>
}

function DocumentosLegales({ items, puedeCrear }: { items: DocLegal[]; puedeCrear: boolean }) {
  if (items.length === 0) return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Sin documentos legales.</CardContent></Card>
  return <div className="space-y-2">{items.map((d) => <DocumentoLegalItem key={d.id} d={d} puedeCrear={puedeCrear} />)}</div>
}

function DocumentoLegalItem({ d, puedeCrear }: { d: DocLegal; puedeCrear: boolean }) {
  const [verVersiones, setVerVersiones] = useState(false)
  const [nuevaVersion, setNuevaVersion] = useState(false)
  const [verDoc, setVerDoc] = useState<{ id: string; titulo: string } | null>(null)
  const vigente = d.versiones.find((x) => x.vigente)
  return (
    <Card><CardContent className="py-3">
      <div className="flex items-center gap-3">
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
          <Button variant="outline" size="sm" onClick={() => setVerDoc({ id: d.documentoId as string, titulo: d.titulo })}><Eye className="size-4" /> Ver</Button>
        )}
        {d.versiones.length > 1 && (
          <Button variant="ghost" size="icon" onClick={() => setVerVersiones((v) => !v)} aria-label="Historial de versiones"><History className="size-4" /></Button>
        )}
        {puedeCrear && (
          <Button variant="outline" size="sm" onClick={() => setNuevaVersion(true)}><Upload className="size-4" /> Nueva versión</Button>
        )}
      </div>
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

function VisorDocumento({ documentoId, titulo, onClose }: { documentoId: string; titulo: string; onClose: () => void }) {
  const url = `/api/documentos/${documentoId}`
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[95vw] sm:max-w-4xl">
        <DialogHeader><DialogTitle className="truncate pr-6">{titulo}</DialogTitle></DialogHeader>
        <iframe src={url} title={titulo} className="w-full h-[70vh] rounded-md border bg-muted" />
        <DialogFooter>
          <Button variant="outline" asChild>
            <a href={url} target="_blank" rel="noreferrer"><ExternalLink className="size-4" /> Abrir en pestaña</a>
          </Button>
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
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

function DialogDocumento({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [f, setF] = useState<Record<string, string>>({ categoria: 'POLITICA' })
  const [archivo, setArchivo] = useState<File | null>(null)
  const [g, setG] = useState(false)
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))
  async function guardar() {
    if (!f.titulo) { toast.error('Escribe el título.'); return }
    setG(true)
    try {
      const res = await crearDocumentoLegal({ categoria: f.categoria as 'POLITICA', titulo: f.titulo, descripcion: f.descripcion, vigenciaFin: f.vigenciaFin })
      if (!res.ok) throw new Error(res.error)
      const id = (res.datos as { id: string }).id
      if (archivo) {
        const docId = await subirArchivoEntidad('DocumentoLegal', id, archivo, f.titulo)
        const rv = await vincularVersionDocumentoLegal({ documentoLegalId: id, documentoId: docId, cambios: 'Versión inicial' })
        if (!rv.ok) throw new Error(rv.error)
      }
      toast.success('Documento registrado.'); onClose(); router.refresh()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo registrar.') } finally { setG(false) }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent>
      <DialogHeader><DialogTitle>Nuevo documento legal</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <Campo label="Categoría">
          <Select value={f.categoria} onValueChange={(v) => set('categoria', v)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(CAT_DOC).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select>
        </Campo>
        <Campo label="Título"><Input onChange={(e) => set('titulo', e.target.value)} /></Campo>
        <Campo label="Descripción"><Textarea rows={2} onChange={(e) => set('descripcion', e.target.value)} /></Campo>
        <Campo label="Vigencia hasta (opcional — genera alerta)"><Input type="date" onChange={(e) => set('vigenciaFin', e.target.value)} /></Campo>
        <Campo label="Archivo PDF (opcional)"><input type="file" accept="image/*,application/pdf" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} className={inputArchivoCls} /></Campo>
      </div>
      <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={guardar} disabled={g}>{g && <Spinner />}Registrar</Button></DialogFooter>
    </DialogContent></Dialog>
  )
}

function DialogDisciplinario({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [colaboradorId, setColaboradorId] = useState('')
  const [f, setF] = useState<Record<string, string>>({ fechaApertura: new Date().toISOString().slice(0, 10) })
  const [archivos, setArchivos] = useState<File[]>([])
  const [g, setG] = useState(false)
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))
  async function guardar() {
    if (!colaboradorId) { toast.error('Selecciona un colaborador.'); return }
    if (!f.asunto || f.asunto.trim().length < 3) { toast.error('Escribe el asunto.'); return }
    setG(true)
    try {
      const res = await crearProcesoDisciplinario({ colaboradorId, asunto: f.asunto, descripcion: f.descripcion, fechaApertura: f.fechaApertura })
      if (!res.ok) throw new Error(res.error)
      const { id, etapaId } = res.datos as { id: string; etapaId: string }
      // Los soportes iniciales quedan anclados a la etapa de apertura (no editables después)
      for (const file of archivos) {
        await subirArchivoEntidad('EtapaProceso', etapaId, file, file.name)
      }
      toast.success('Proceso abierto.'); onClose(); router.push(`/juridica/disciplinarios/${id}`)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo abrir el proceso.') } finally { setG(false) }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent>
      <DialogHeader><DialogTitle>Abrir proceso disciplinario</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <Campo label="Colaborador"><SelectorColaborador value={colaboradorId} onChange={(id) => setColaboradorId(id)} /></Campo>
        <Campo label="Asunto"><Input onChange={(e) => set('asunto', e.target.value)} /></Campo>
        <Campo label="Descripción"><Textarea rows={2} onChange={(e) => set('descripcion', e.target.value)} /></Campo>
        <Campo label="Fecha de apertura"><Input type="date" value={f.fechaApertura} onChange={(e) => set('fechaApertura', e.target.value)} /></Campo>
        <Campo label="Soportes de prueba (opcional — imágenes, PDF, video)">
          <ZonaArchivos archivos={archivos} onChange={setArchivos} accept="image/*,application/pdf,video/*" />
        </Campo>
      </div>
      <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={guardar} disabled={g}>{g && <Spinner />}Abrir</Button></DialogFooter>
    </DialogContent></Dialog>
  )
}

function DialogConsulta({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [f, setF] = useState<Record<string, string>>({ tipo: 'CONSULTA', fechaRadicacion: new Date().toISOString().slice(0, 10) })
  const [g, setG] = useState(false)
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))
  async function guardar() {
    setG(true)
    const res = await crearConsultaReclamo({ tipo: f.tipo as 'CONSULTA', titular: f.titular ?? '', descripcion: f.descripcion ?? '', fechaRadicacion: f.fechaRadicacion })
    setG(false)
    if (res.ok) { toast.success('Registrado.'); onClose(); router.refresh() } else toast.error(res.error)
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent>
      <DialogHeader>
        <DialogTitle>Consulta o reclamo de un tercero</DialogTitle>
        <DialogDescription>Para titulares SIN autoservicio (ex-empleados, clientes). Los colaboradores activos lo radican desde su propio autoservicio.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <Campo label="Tipo">
          <Select value={f.tipo} onValueChange={(v) => set('tipo', v)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="CONSULTA">Consulta (10 días hábiles)</SelectItem><SelectItem value="RECLAMO">Reclamo (15 días hábiles)</SelectItem></SelectContent></Select>
        </Campo>
        <Campo label="Titular de los datos"><Input onChange={(e) => set('titular', e.target.value)} /></Campo>
        <Campo label="Descripción"><Textarea rows={3} onChange={(e) => set('descripcion', e.target.value)} /></Campo>
        <Campo label="Fecha de radicación"><Input type="date" value={f.fechaRadicacion} onChange={(e) => set('fechaRadicacion', e.target.value)} /></Campo>
      </div>
      <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={guardar} disabled={g}>{g && <Spinner />}Registrar</Button></DialogFooter>
    </DialogContent></Dialog>
  )
}
