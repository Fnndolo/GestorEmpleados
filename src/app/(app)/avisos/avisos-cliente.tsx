'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, ChevronDown, Check, ArrowRight, Send, Pencil, Archive, Trash2, RefreshCw, Camera, X, Megaphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { Pill, type PillTone } from '@/components/ui-kit'
import { TIPOS_AVISO, etiquetaTipoAviso, tonoTipoAviso, bloquesDetalle, type Audiencia } from '@/lib/avisos'
import { crearAviso, editarAviso, publicarAviso, reavisar, archivarAviso, eliminarAviso, marcarAvisoLeido, lecturasDeAviso } from './acciones'

export type AvisoLector = {
  id: string; titulo: string; resumen: string; detalle: string | null; tipo: string; enlace: string | null
  imagenUrl: string | null; publicadoEn: string; vigente: boolean; leido: boolean
}
export type AvisoGestion = {
  id: string; titulo: string; resumen: string; detalle: string; tipo: string; enlace: string
  estado: string; publicadoEn: string | null; vigenteHasta: string
  audiencia: Required<Audiencia>; audienciaTexto: string
  imagenUrl: string | null; leidos: number; total: number
}
type Gestion = { avisos: AvisoGestion[]; roles: string[]; sedes: { id: string; nombre: string }[] }

const ESTADO: Record<string, { texto: string; tone: PillTone }> = {
  BORRADOR: { texto: 'Borrador', tone: 'muted' }, PUBLICADO: { texto: 'Publicado', tone: 'ok' }, ARCHIVADO: { texto: 'Archivado', tone: 'muted' },
}

/** Rutas de la app a las que suele apuntar un aviso; "Otra" deja escribir cualquiera. */
const RUTAS = [
  ['/autoservicio', 'Autoservicio (inicio)'], ['/autoservicio/dotacion', 'Mis entregas'], ['/autoservicio/documentos', 'Mis documentos'],
  ['/autoservicio/desprendibles', 'Desprendibles'], ['/autoservicio/contratos', 'Mis contratos'], ['/autoservicio/mi-informacion', 'Mi información'],
  ['/autoservicio/juridica?vista=anti-acoso', 'Línea ética'], ['/autoservicio/juridica?vista=habeas-data', 'Habeas data'],
  ['/autoservicio/disciplinarios', 'Mis disciplinarios'], ['/autoservicio/aprobaciones', 'Aprobaciones'], ['/autoservicio/capacitaciones', 'Mis capacitaciones'],
  ['/nomina/novedades', 'Nómina · Novedades'], ['/activos', 'Activos y dotación'], ['/colaboradores', 'Colaboradores'],
] as const
const OTRA = '__otra__'
const SIN_ENLACE = '__ninguno__'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
/** "21 sep 2026": cabe en la línea de las etiquetas. */
const fechaCorta = (iso: string) => { const d = new Date(iso); return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)} ${d.getFullYear()}` }

// La captura la sirve nuestra ruta con sesión, no un CDN.
// eslint-disable-next-line @next/next/no-img-element
const Captura = ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} className="max-h-96 w-full rounded-lg border object-contain bg-muted/30" loading="lazy" />

/** El cuerpo de un aviso: párrafos y viñetas, la captura y el botón al módulo. */
export function CuerpoAviso({ detalle, imagenUrl, enlace, titulo }: { detalle: string | null; imagenUrl: string | null; enlace: string | null; titulo: string }) {
  const bloques = bloquesDetalle(detalle)
  return (
    <div className="space-y-3 text-sm">
      {bloques.map((b, i) => b.tipo === 'lista'
        ? <ul key={i} className="list-disc space-y-1 pl-5">{b.lineas.map((l, j) => <li key={j}>{l}</li>)}</ul>
        : <p key={i}>{b.lineas[0]}</p>)}
      {imagenUrl && <Captura src={imagenUrl} alt={`Captura: ${titulo}`} />}
      {enlace && (
        <Button size="sm" asChild><Link href={enlace}>Ir al módulo <ArrowRight className="size-4" /></Link></Button>
      )}
    </div>
  )
}

export function AvisosCliente({ avisos, gestion, verId, vistaInicial }: {
  avisos: AvisoLector[]; gestion: Gestion | null; verId: string | null; vistaInicial: 'avisos' | 'gestion'
}) {
  const router = useRouter()
  const [vista, setVista] = useState<'avisos' | 'gestion'>(vistaInicial)
  const [abierto, setAbierto] = useState<string | null>(verId)
  const [marcando, setMarcando] = useState<string | null>(null)
  // "Nuevo aviso" vive en la fila de las pestañas; el diálogo lo abre la gestión.
  const [crear, setCrear] = useState(false)

  async function entendido(id: string) {
    setMarcando(id)
    const res = await marcarAvisoLeido({ id })
    setMarcando(null)
    if (!res.ok) { toast.error(res.error); return }
    window.dispatchEvent(new Event('sg:refrescar-avisos'))
    router.refresh()
  }

  const ordenados = [...avisos].sort((a, b) => Number(a.leido) - Number(b.leido))

  return (
    <div>
      {gestion && (
        <div className="mb-3 flex items-center gap-1.5">
          {([['avisos', 'Avisos'], ['gestion', 'Gestión']] as const).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setVista(v)} className={cn('rounded-full px-3 py-1.5 text-sm font-medium transition-colors', vista === v ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent')}>{l}</button>
          ))}
          {vista === 'gestion' && (
            <Button size="sm" className="ml-auto" onClick={() => setCrear(true)} aria-label="Nuevo aviso" title="Nuevo aviso">
              <Plus className="size-4" /> <span className="hidden sm:inline">Nuevo aviso</span>
            </Button>
          )}
        </div>
      )}

      {vista === 'avisos' && (
        ordenados.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
            <Megaphone className="mx-auto mb-2 size-6" /> Sin avisos por ahora.
          </CardContent></Card>
        ) : (
          <Card className="py-0"><CardContent className="divide-y p-0">
            {ordenados.map((a) => {
              const exp = abierto === a.id
              return (
                // Acordeón, como la gestión: cerrado, título y etiquetas en dos
                // líneas; el texto completo, al abrirlo.
                <div key={a.id} id={`aviso-${a.id}`}>
                  <button type="button" onClick={() => setAbierto(exp ? null : a.id)} aria-expanded={exp} className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                    <span className={cn('grid size-9 shrink-0 place-items-center rounded-[10px]', a.leido ? 'bg-foreground/8 text-muted-foreground' : 'bg-foreground text-background')}>
                      <Megaphone className="size-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn('block text-sm', exp ? 'font-semibold' : 'truncate', !a.leido && 'font-semibold')}>{a.titulo}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <Pill tone={tonoTipoAviso(a.tipo)}>{etiquetaTipoAviso(a.tipo)}</Pill>
                        {!a.leido && <Pill tone="warn">Sin leer</Pill>}
                        <span className="text-[11px] text-muted-foreground">{fechaCorta(a.publicadoEn)}</span>
                      </span>
                    </span>
                    <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', exp && 'rotate-180')} />
                  </button>
                  {exp && (
                    <div className="space-y-3 border-t border-dashed bg-muted/20 px-3 py-3 animate-in fade-in slide-in-from-top-1 duration-150">
                      <CuerpoAviso detalle={a.detalle ?? a.resumen} imagenUrl={a.imagenUrl} enlace={a.enlace} titulo={a.titulo} />
                      {!a.leido && (
                        <div className="flex justify-end">
                          <Button size="sm" variant="ghost" onClick={() => entendido(a.id)} disabled={marcando === a.id}>
                            {marcando === a.id ? <Spinner /> : <Check className="size-4" />} Entendido
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </CardContent></Card>
        )
      )}

      {vista === 'gestion' && gestion && <GestionAvisos gestion={gestion} crear={crear} onCrearCerrado={() => setCrear(false)} />}
    </div>
  )
}

function GestionAvisos({ gestion, crear, onCrearCerrado }: { gestion: Gestion; crear: boolean; onCrearCerrado: () => void }) {
  const router = useRouter()
  const [editando, setEditando] = useState<AvisoGestion | null>(null)
  const dialogo = crear ? { modo: 'nuevo' as const } : editando ? { modo: 'editar' as const, aviso: editando } : null
  const cerrarDialogo = () => { setEditando(null); onCrearCerrado() }
  // Acordeón: cerrado se ve título, estado y lecturas; abierto, el texto y las acciones.
  const [abierto, setAbierto] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [lecturas, setLecturas] = useState<{ id: string; total: number; leidos: string[]; pendientes: string[] } | null>(null)

  async function ejecutar(id: string, fn: () => Promise<{ ok: boolean; error?: string; datos?: unknown }>, exito: (d: unknown) => string) {
    setOcupado(id)
    const res = await fn()
    setOcupado(null)
    if (!res.ok) { toast.error(res.error, { duration: 8000 }); return }
    toast.success(exito(res.datos))
    router.refresh()
  }

  async function verLecturas(a: AvisoGestion) {
    const res = await lecturasDeAviso({ id: a.id })
    if (!res.ok) { toast.error(res.error); return }
    setLecturas({ id: a.id, ...res.datos })
  }

  return (
    <>
      {gestion.avisos.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Aún no hay avisos.</CardContent></Card>
      ) : (
        <Card className="py-0"><CardContent className="divide-y p-0">
          {gestion.avisos.map((a) => {
            const est = ESTADO[a.estado] ?? ESTADO.BORRADOR
            const trabajando = ocupado === a.id
            const exp = abierto === a.id
            return (
              <div key={a.id}>
                <button
                  type="button"
                  onClick={() => setAbierto(exp ? null : a.id)}
                  aria-expanded={exp}
                  className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-accent/40"
                >
                  <span className={cn('grid size-9 shrink-0 place-items-center rounded-[10px]', a.estado === 'PUBLICADO' ? 'bg-foreground text-background' : 'bg-foreground/8 text-muted-foreground')}>
                    <Megaphone className="size-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{a.titulo}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <Pill tone={est.tone}>{est.texto}</Pill>
                      <Pill tone={tonoTipoAviso(a.tipo)}>{etiquetaTipoAviso(a.tipo)}</Pill>
                      {a.estado === 'PUBLICADO' && <span className="text-[11px] text-muted-foreground tabular-nums">{a.leidos}/{a.total} vistos</span>}
                    </span>
                  </span>
                  <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', exp && 'rotate-180')} />
                </button>
                {exp && (
                <div className="space-y-2 border-t border-dashed bg-muted/20 px-3 py-3 animate-in fade-in slide-in-from-top-1 duration-150">
                  <p className="text-sm">{a.resumen}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Para: {a.audienciaTexto}{a.publicadoEn ? ` · publicado ${a.publicadoEn}` : ''}{a.vigenteHasta ? ` · destacado hasta ${a.vigenteHasta}` : ''}{a.imagenUrl ? ' · con imagen' : ''}
                  </p>
                  {a.estado === 'PUBLICADO' && (
                    <button type="button" onClick={() => verLecturas(a)} className="text-[11px] font-semibold text-primary hover:underline">
                      Ver quién lo ha visto ({a.leidos} de {a.total})
                    </button>
                  )}
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  {a.estado !== 'ARCHIVADO' && (
                    <Button size="icon" variant="outline" onClick={() => setEditando(a)} disabled={trabajando} aria-label="Editar" title="Editar"><Pencil className="size-4" /></Button>
                  )}
                  {a.estado === 'BORRADOR' && (
                    <>
                      <Button size="icon" variant="outline" onClick={() => { if (confirm('¿Eliminar este borrador?')) ejecutar(a.id, () => eliminarAviso({ id: a.id }), () => 'Borrador eliminado.') }} disabled={trabajando} aria-label="Eliminar" title="Eliminar"><Trash2 className="size-4" /></Button>
                      <Button size="sm" onClick={() => { if (confirm(`¿Publicar «${a.titulo}» para: ${a.audienciaTexto}? Cada persona recibirá la notificación.`)) ejecutar(a.id, () => publicarAviso({ id: a.id }), (d) => `Publicado y notificado a ${(d as { notificados: number }).notificados} persona(s).`) }} disabled={trabajando} aria-label="Publicar" title="Publicar">
                        {trabajando ? <Spinner /> : <Send className="size-4" />} <span className="hidden sm:inline">Publicar</span>
                      </Button>
                    </>
                  )}
                  {a.estado === 'PUBLICADO' && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => ejecutar(a.id, () => reavisar({ id: a.id }), (d) => `Reenviado a ${(d as { notificados: number }).notificados} persona(s) que no lo habían leído.`)} disabled={trabajando} title="Re-avisar a quienes no lo han leído" aria-label="Re-avisar">
                        {trabajando ? <Spinner /> : <RefreshCw className="size-4" />} <span className="hidden sm:inline">Re-avisar</span>
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { if (confirm('¿Archivar? Dejará de mostrarse a todos.')) ejecutar(a.id, () => archivarAviso({ id: a.id }), () => 'Aviso archivado.') }} disabled={trabajando} aria-label="Archivar" title="Archivar">
                        <Archive className="size-4" /> <span className="hidden sm:inline">Archivar</span>
                      </Button>
                    </>
                  )}
                </div>
                </div>
                )}
              </div>
            )
          })}
        </CardContent></Card>
      )}

      {dialogo && (
        <DialogAviso
          gestion={gestion}
          aviso={dialogo.modo === 'editar' ? dialogo.aviso : null}
          onClose={cerrarDialogo}
          onDone={() => { cerrarDialogo(); router.refresh() }}
        />
      )}
      {lecturas && (
        <Dialog open onOpenChange={(o) => !o && setLecturas(null)}>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
            <DialogHeader><DialogTitle>Visto por {lecturas.leidos.length} de {lecturas.total}</DialogTitle></DialogHeader>
            <div className="grid gap-4 text-sm sm:grid-cols-2">
              <div><p className="mb-1 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Ya lo leyeron</p>{lecturas.leidos.length ? <ul className="space-y-0.5">{lecturas.leidos.map((n) => <li key={n}>{n}</li>)}</ul> : <p className="text-muted-foreground">Nadie todavía.</p>}</div>
              <div><p className="mb-1 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Pendientes</p>{lecturas.pendientes.length ? <ul className="space-y-0.5">{lecturas.pendientes.map((n) => <li key={n}>{n}</li>)}</ul> : <p className="text-muted-foreground">Todos lo leyeron.</p>}</div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

function DialogAviso({ gestion, aviso, onClose, onDone }: { gestion: Gestion; aviso: AvisoGestion | null; onClose: () => void; onDone: () => void }) {
  const router = useRouter()
  const [titulo, setTitulo] = useState(aviso?.titulo ?? '')
  // Un solo texto. Los avisos viejos traían resumen y "cómo se usa" por separado:
  // se juntan (sin repetir el resumen si el detalle ya empieza con él).
  const [comentario, setComentario] = useState(() => {
    if (!aviso) return ''
    if (!aviso.detalle) return aviso.resumen
    const inicio = aviso.resumen.replace(/…$/, '')
    return aviso.detalle.replace(/\s+/g, ' ').startsWith(inicio) ? aviso.detalle : `${aviso.resumen}\n\n${aviso.detalle}`
  })
  const [tipo, setTipo] = useState(aviso?.tipo ?? 'COMUNICADO')
  const enlaceInicial = aviso?.enlace ?? ''
  const conocido = RUTAS.some(([r]) => r === enlaceInicial)
  const [rutaSel, setRutaSel] = useState(enlaceInicial ? (conocido ? enlaceInicial : OTRA) : SIN_ENLACE)
  const [rutaLibre, setRutaLibre] = useState(conocido ? '' : enlaceInicial)
  const [vigenteHasta, setVigenteHasta] = useState(aviso?.vigenteHasta ?? '')
  const [roles, setRoles] = useState<string[]>(aviso?.audiencia.roles ?? [])
  const [vinculos, setVinculos] = useState<string[]>(aviso?.audiencia.vinculos ?? [])
  const [sedeIds, setSedeIds] = useState<string[]>(aviso?.audiencia.sedeIds ?? [])
  const [guardando, setGuardando] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [imagenUrl, setImagenUrl] = useState(aviso?.imagenUrl ?? null)
  const inputImagen = useRef<HTMLInputElement>(null)

  async function guardar() {
    const enlace = rutaSel === OTRA ? rutaLibre.trim() : rutaSel === SIN_ENLACE ? '' : rutaSel
    const datos = {
      titulo, comentario, tipo: tipo as 'COMUNICADO' | 'NUEVO_MODULO' | 'MEJORA' | 'CAMBIO', enlace, vigenteHasta,
      audiencia: { roles, vinculos: vinculos as ('LABORAL' | 'OPS')[], sedeIds },
    }
    setGuardando(true)
    const res = aviso ? await editarAviso({ id: aviso.id, ...datos }) : await crearAviso(datos)
    setGuardando(false)
    if (!res.ok) { toast.error(res.error, { duration: 8000 }); return }
    toast.success(aviso ? 'Aviso guardado.' : 'Guardado como borrador. Publícalo desde la lista.')
    onDone()
  }

  async function subirImagen(archivo: File) {
    if (!aviso) return
    setSubiendo(true)
    try {
      const { default: comprimir } = await import('browser-image-compression')
      const reducida = await comprimir(archivo, { maxSizeMB: 0.8, maxWidthOrHeight: 1600, useWebWorker: true })
      const fd = new FormData()
      fd.append('archivo', new File([reducida], archivo.name, { type: reducida.type || archivo.type }))
      const resp = await fetch(`/api/avisos/${aviso.id}/imagen`, { method: 'POST', body: fd })
      const j = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(j.error ?? 'No se pudo subir la imagen.')
      setImagenUrl(`/api/avisos/${aviso.id}/imagen?v=${Date.now()}`)
      toast.success('Imagen guardada.')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo subir la imagen.')
    } finally {
      setSubiendo(false)
    }
  }

  async function quitarImagen() {
    if (!aviso) return
    setSubiendo(true)
    const resp = await fetch(`/api/avisos/${aviso.id}/imagen`, { method: 'DELETE' })
    setSubiendo(false)
    if (!resp.ok) { toast.error('No se pudo quitar la imagen.'); return }
    setImagenUrl(null); router.refresh()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{aviso ? 'Editar aviso' : 'Nuevo aviso'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div className="space-y-1.5"><Label htmlFor="av-titulo">Título <span className="text-destructive">*</span></Label><Input id="av-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={120} autoFocus /></div>
            <div className="space-y-1.5"><Label>Tipo</Label>
              <Select value={tipo} onValueChange={setTipo}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>{TIPOS_AVISO.map((t) => <SelectItem key={t.valor} value={t.valor}>{t.etiqueta}</SelectItem>)}</SelectContent></Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="av-comentario">Comentario <span className="text-destructive">*</span></Label>
            <Textarea id="av-comentario" rows={5} value={comentario} onChange={(e) => setComentario(e.target.value)} maxLength={4000} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="min-w-0 space-y-1.5"><Label>Lleva al módulo</Label>
              <Select value={rutaSel} onValueChange={setRutaSel}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_ENLACE}>Ninguno</SelectItem>
                  {RUTAS.map(([r, l]) => <SelectItem key={r} value={r}>{l}</SelectItem>)}
                  <SelectItem value={OTRA}>Otra ruta…</SelectItem>
                </SelectContent></Select>
            </div>
            <div className="min-w-0 space-y-1.5"><Label htmlFor="av-hasta">Destacar hasta</Label><Input id="av-hasta" type="date" value={vigenteHasta} onChange={(e) => setVigenteHasta(e.target.value)} /></div>
          </div>
          {rutaSel === OTRA && <Input value={rutaLibre} onChange={(e) => setRutaLibre(e.target.value)} placeholder="/ruta/de/la/app" />}

          {/* Para quién: tres desplegables. Vacío = todos; lo marcado se cruza. */}
          <div className="space-y-1.5">
            <Label>Para quién</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <SelectorVarios titulo="roles" todos="Todos los roles" opciones={gestion.roles.map((r) => ({ valor: r, etiqueta: r }))} valores={roles} onChange={setRoles} />
              <SelectorVarios titulo="vínculos" todos="Todos los vínculos" opciones={[{ valor: 'LABORAL', etiqueta: 'Vínculo laboral' }, { valor: 'OPS', etiqueta: 'Contratistas OPS' }]} valores={vinculos} onChange={setVinculos} />
              <SelectorVarios titulo="sedes" todos="Todas las sedes" opciones={gestion.sedes.map((s) => ({ valor: s.id, etiqueta: s.nombre }))} valores={sedeIds} onChange={setSedeIds} />
            </div>
          </div>

          {aviso && (
            <div className="flex flex-wrap items-center gap-2">
              {imagenUrl && <Captura src={imagenUrl} alt="Imagen del aviso" />}
              <Button type="button" size="sm" variant="outline" onClick={() => inputImagen.current?.click()} disabled={subiendo}>
                {subiendo ? <Spinner /> : <Camera className="size-4" />} {imagenUrl ? 'Cambiar imagen' : 'Agregar imagen'}
              </Button>
              {imagenUrl && <Button type="button" size="sm" variant="ghost" onClick={quitarImagen} disabled={subiendo}><X className="size-4" /> Quitar</Button>}
              <input ref={inputImagen} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) subirImagen(f); e.target.value = '' }} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando}>{guardando && <Spinner />} {aviso ? 'Guardar' : 'Guardar borrador'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Desplegable de varias opciones (casillas). Sin nada marcado muestra `todos`. */
function SelectorVarios({ titulo, todos, opciones, valores, onChange }: {
  titulo: string; todos: string; opciones: { valor: string; etiqueta: string }[]; valores: string[]; onChange: (v: string[]) => void
}) {
  const elegidas = opciones.filter((o) => valores.includes(o.valor))
  const texto = elegidas.length === 0 ? todos : elegidas.length === 1 ? elegidas[0].etiqueta : `${elegidas.length} ${titulo}`
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" className="w-full justify-between font-normal">
          <span className={cn('truncate', elegidas.length === 0 && 'text-muted-foreground')}>{texto}</span>
          <ChevronDown className="size-4 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-(--radix-dropdown-menu-trigger-width) min-w-48 overflow-y-auto">
        {opciones.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.valor}
            checked={valores.includes(o.valor)}
            // Que no se cierre al marcar: normalmente se eligen varias.
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(c) => onChange(c ? [...valores, o.valor] : valores.filter((v) => v !== o.valor))}
          >
            {o.etiqueta}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
