'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, ChevronDown, Check, ArrowRight, Send, Pencil, Archive, Trash2, RefreshCw, Camera, X, Eye, Megaphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const fechaLarga = (iso: string) => { const d = new Date(iso); return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}` }

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
        <div className="mb-3 flex gap-1.5">
          {([['avisos', 'Avisos'], ['gestion', 'Gestión']] as const).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setVista(v)} className={cn('rounded-full px-3 py-1 text-xs font-semibold transition-colors', vista === v ? 'bg-foreground text-background' : 'border bg-card text-muted-foreground hover:bg-accent')}>{l}</button>
          ))}
        </div>
      )}

      {vista === 'avisos' && (
        ordenados.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
            <Megaphone className="mx-auto mb-2 size-6" /> Sin avisos por ahora. Aquí aparecerá lo nuevo de la app y cómo usarlo.
          </CardContent></Card>
        ) : (
          <Card><CardContent className="divide-y p-0">
            {ordenados.map((a) => {
              const exp = abierto === a.id
              return (
                <div key={a.id} id={`aviso-${a.id}`} className="p-3">
                  <button type="button" onClick={() => setAbierto(exp ? null : a.id)} aria-expanded={exp} className="flex w-full items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <span className={cn('grid size-9 shrink-0 place-items-center rounded-[10px]', a.leido ? 'bg-foreground/8 text-muted-foreground' : 'bg-foreground text-background')}>
                      <Megaphone className="size-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-bold">{a.titulo}</span>
                        <Pill tone={tonoTipoAviso(a.tipo)}>{etiquetaTipoAviso(a.tipo)}</Pill>
                        {!a.leido && <Pill tone="warn">Sin leer</Pill>}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{a.resumen}</span>
                      <span className="block text-[11px] text-muted-foreground">{fechaLarga(a.publicadoEn)}</span>
                    </span>
                    <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', exp && 'rotate-180')} />
                  </button>
                  {exp && (
                    <div className="mt-3 space-y-3 border-t pt-3">
                      <CuerpoAviso detalle={a.detalle} imagenUrl={a.imagenUrl} enlace={a.enlace} titulo={a.titulo} />
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

      {vista === 'gestion' && gestion && <GestionAvisos gestion={gestion} />}
    </div>
  )
}

function GestionAvisos({ gestion }: { gestion: Gestion }) {
  const router = useRouter()
  const [dialogo, setDialogo] = useState<{ modo: 'nuevo' } | { modo: 'editar'; aviso: AvisoGestion } | null>(null)
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
      <div className="mb-3 flex justify-end">
        <Button size="sm" onClick={() => setDialogo({ modo: 'nuevo' })}><Plus className="size-4" /> Nuevo aviso</Button>
      </div>
      {gestion.avisos.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Aún no hay avisos. Crea el primero: un módulo nuevo, una mejora o un cambio, y publícalo cuando esté listo.</CardContent></Card>
      ) : (
        <Card><CardContent className="divide-y p-0">
          {gestion.avisos.map((a) => {
            const est = ESTADO[a.estado] ?? ESTADO.BORRADOR
            const trabajando = ocupado === a.id
            return (
              <div key={a.id} className="p-3">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold">
                      {a.titulo} <Pill tone={est.tone}>{est.texto}</Pill> <Pill tone={tonoTipoAviso(a.tipo)}>{etiquetaTipoAviso(a.tipo)}</Pill>
                    </p>
                    <p className="text-xs text-muted-foreground">{a.resumen}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Para: {a.audienciaTexto}{a.publicadoEn ? ` · publicado ${a.publicadoEn}` : ''}{a.vigenteHasta ? ` · destacado hasta ${a.vigenteHasta}` : ''}{a.imagenUrl ? ' · con captura' : ''}
                    </p>
                    {a.estado === 'PUBLICADO' && (
                      <button type="button" onClick={() => verLecturas(a)} className="mt-1 text-[11px] font-semibold text-primary hover:underline">
                        Visto por {a.leidos} de {a.total}
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5">
                  {a.estado !== 'ARCHIVADO' && (
                    <Button size="icon" variant="outline" onClick={() => setDialogo({ modo: 'editar', aviso: a })} disabled={trabajando} aria-label="Editar" title="Editar"><Pencil className="size-4" /></Button>
                  )}
                  {a.estado === 'BORRADOR' && (
                    <>
                      <Button size="icon" variant="outline" onClick={() => { if (confirm('¿Eliminar este borrador?')) ejecutar(a.id, () => eliminarAviso({ id: a.id }), () => 'Borrador eliminado.') }} disabled={trabajando} aria-label="Eliminar" title="Eliminar"><Trash2 className="size-4" /></Button>
                      <Button size="sm" onClick={() => { if (confirm(`¿Publicar «${a.titulo}» para: ${a.audienciaTexto}? Cada persona recibirá la notificación.`)) ejecutar(a.id, () => publicarAviso({ id: a.id }), (d) => `Publicado y notificado a ${(d as { notificados: number }).notificados} persona(s).`) }} disabled={trabajando}>
                        {trabajando ? <Spinner /> : <Send className="size-4" />} Publicar
                      </Button>
                    </>
                  )}
                  {a.estado === 'PUBLICADO' && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => ejecutar(a.id, () => reavisar({ id: a.id }), (d) => `Reenviado a ${(d as { notificados: number }).notificados} persona(s) que no lo habían leído.`)} disabled={trabajando} title="Volver a notificar a quienes no lo han leído">
                        {trabajando ? <Spinner /> : <RefreshCw className="size-4" />} Re-avisar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { if (confirm('¿Archivar? Dejará de mostrarse a todos.')) ejecutar(a.id, () => archivarAviso({ id: a.id }), () => 'Aviso archivado.') }} disabled={trabajando}>
                        <Archive className="size-4" /> Archivar
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </CardContent></Card>
      )}

      {dialogo && (
        <DialogAviso
          gestion={gestion}
          aviso={dialogo.modo === 'editar' ? dialogo.aviso : null}
          onClose={() => setDialogo(null)}
          onDone={() => { setDialogo(null); router.refresh() }}
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
  const [resumen, setResumen] = useState(aviso?.resumen ?? '')
  const [detalle, setDetalle] = useState(aviso?.detalle ?? '')
  const [tipo, setTipo] = useState(aviso?.tipo ?? 'NUEVO_MODULO')
  const enlaceInicial = aviso?.enlace ?? ''
  const conocido = RUTAS.some(([r]) => r === enlaceInicial)
  const [rutaSel, setRutaSel] = useState(enlaceInicial ? (conocido ? enlaceInicial : OTRA) : '')
  const [rutaLibre, setRutaLibre] = useState(conocido ? '' : enlaceInicial)
  const [vigenteHasta, setVigenteHasta] = useState(aviso?.vigenteHasta ?? '')
  const [roles, setRoles] = useState<string[]>(aviso?.audiencia.roles ?? [])
  const [vinculos, setVinculos] = useState<('LABORAL' | 'OPS')[]>(aviso?.audiencia.vinculos ?? [])
  const [sedeIds, setSedeIds] = useState<string[]>(aviso?.audiencia.sedeIds ?? [])
  const [guardando, setGuardando] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [imagenUrl, setImagenUrl] = useState(aviso?.imagenUrl ?? null)
  const inputImagen = useRef<HTMLInputElement>(null)

  const alternar = <T,>(lista: T[], v: T, set: (x: T[]) => void) => set(lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v])

  async function guardar() {
    const enlace = rutaSel === OTRA ? rutaLibre.trim() : rutaSel
    const datos = { titulo, resumen, detalle, tipo: tipo as 'NUEVO_MODULO' | 'MEJORA' | 'CAMBIO', enlace, vigenteHasta, audiencia: { roles, vinculos, sedeIds } }
    setGuardando(true)
    const res = aviso ? await editarAviso({ id: aviso.id, ...datos }) : await crearAviso(datos)
    setGuardando(false)
    if (!res.ok) { toast.error(res.error, { duration: 8000 }); return }
    if (aviso) { toast.success('Aviso guardado.'); onDone(); return }
    toast.success('Guardado como borrador. Agrégale la captura si quieres y publícalo desde la lista.')
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
      if (!resp.ok) throw new Error(j.error ?? 'No se pudo subir la captura.')
      setImagenUrl(`/api/avisos/${aviso.id}/imagen?v=${Date.now()}`)
      toast.success('Captura guardada.')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo subir la captura.')
    } finally {
      setSubiendo(false)
    }
  }

  async function quitarImagen() {
    if (!aviso) return
    setSubiendo(true)
    const resp = await fetch(`/api/avisos/${aviso.id}/imagen`, { method: 'DELETE' })
    setSubiendo(false)
    if (!resp.ok) { toast.error('No se pudo quitar la captura.'); return }
    setImagenUrl(null); router.refresh()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{aviso ? 'Editar aviso' : 'Nuevo aviso'}</DialogTitle>
          <DialogDescription>Lo que verá cada persona en la app: qué es y cómo se usa.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="space-y-1.5"><Label htmlFor="av-titulo">Título <span className="text-destructive">*</span></Label><Input id="av-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={120} placeholder="Ej.: Ya puedes ver tus entregas en el celular" autoFocus /></div>
            <div className="space-y-1.5"><Label>Tipo</Label>
              <Select value={tipo} onValueChange={setTipo}><SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
                <SelectContent>{TIPOS_AVISO.map((t) => <SelectItem key={t.valor} value={t.valor}>{t.etiqueta}</SelectItem>)}</SelectContent></Select>
            </div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="av-resumen">Resumen <span className="text-destructive">*</span></Label><Textarea id="av-resumen" rows={2} value={resumen} onChange={(e) => setResumen(e.target.value)} maxLength={300} placeholder="Una o dos líneas: qué cambia para la persona." /></div>
          <div className="space-y-1.5">
            <Label htmlFor="av-detalle">Cómo se usa</Label>
            <Textarea id="av-detalle" rows={6} value={detalle} onChange={(e) => setDetalle(e.target.value)} maxLength={4000} placeholder={'Pasos cortos. Una línea por paso; empieza con "- " para viñeta.\n- Entra a Autoservicio → Mis entregas\n- Toca Firmar y dibuja tu firma'} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Lleva al módulo</Label>
              <Select value={rutaSel} onValueChange={setRutaSel}><SelectTrigger className="w-full"><SelectValue placeholder="Sin enlace" /></SelectTrigger>
                <SelectContent>{RUTAS.map(([r, l]) => <SelectItem key={r} value={r}>{l}</SelectItem>)}<SelectItem value={OTRA}>Otra ruta…</SelectItem></SelectContent></Select>
              {rutaSel === OTRA && <Input value={rutaLibre} onChange={(e) => setRutaLibre(e.target.value)} placeholder="/ruta/de/la/app" />}
            </div>
            <div className="space-y-1.5"><Label htmlFor="av-hasta">Destacar hasta</Label><Input id="av-hasta" type="date" value={vigenteHasta} onChange={(e) => setVigenteHasta(e.target.value)} /><p className="text-[11px] text-muted-foreground">Después queda solo en el historial.</p></div>
          </div>

          <fieldset className="space-y-2 rounded-lg border p-3">
            <legend className="px-1 text-xs font-bold">Para quién</legend>
            <p className="text-[11px] text-muted-foreground">Sin marcar nada, es para todos. Lo marcado se cruza: rol y vínculo y sede.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Roles</p>
                <div className="space-y-1">{gestion.roles.map((r) => (
                  <label key={r} className="flex items-center gap-2 text-sm"><Checkbox checked={roles.includes(r)} onCheckedChange={() => alternar(roles, r, setRoles)} /> {r}</label>
                ))}</div>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="mb-1 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Vínculo</p>
                  <label className="flex items-center gap-2 text-sm"><Checkbox checked={vinculos.includes('LABORAL')} onCheckedChange={() => alternar(vinculos, 'LABORAL', setVinculos)} /> Vínculo laboral</label>
                  <label className="flex items-center gap-2 text-sm"><Checkbox checked={vinculos.includes('OPS')} onCheckedChange={() => alternar(vinculos, 'OPS', setVinculos)} /> Contratistas OPS</label>
                </div>
                <div>
                  <p className="mb-1 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Sedes</p>
                  <div className="space-y-1">{gestion.sedes.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm"><Checkbox checked={sedeIds.includes(s.id)} onCheckedChange={() => alternar(sedeIds, s.id, setSedeIds)} /> {s.nombre}</label>
                  ))}</div>
                </div>
              </div>
            </div>
          </fieldset>

          {aviso ? (
            <div className="space-y-1.5">
              <Label>Captura de pantalla</Label>
              {imagenUrl && <Captura src={imagenUrl} alt="Captura del aviso" />}
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => inputImagen.current?.click()} disabled={subiendo}>
                  {subiendo ? <Spinner /> : <Camera className="size-4" />} {imagenUrl ? 'Cambiar captura' : 'Subir captura'}
                </Button>
                {imagenUrl && <Button type="button" size="sm" variant="ghost" onClick={quitarImagen} disabled={subiendo}><X className="size-4" /> Quitar</Button>}
                <input ref={inputImagen} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) subirImagen(f); e.target.value = '' }} />
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground"><Eye className="mr-1 inline size-3.5" />La captura de pantalla se agrega después de guardar, al editar el borrador.</p>
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
