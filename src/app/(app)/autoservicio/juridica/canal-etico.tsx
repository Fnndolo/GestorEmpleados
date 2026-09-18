'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ShieldAlert, FileLock, Copy, Search, Paperclip, X } from 'lucide-react'
import { Pill, type PillTone } from '@/components/ui-kit'
import { formatFechaCorta } from '@/lib/fechas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { crearMiDenuncia, crearMiConsultaReclamo, consultarMiDenuncia } from '../juridica-acciones'

const ESTADO_DENUNCIA: Record<string, { label: string; tone: PillTone; nota: string }> = {
  RECIBIDA: { label: 'Recibida', tone: 'warn', nota: 'Tu denuncia fue recibida y está pendiente de revisión por el Comité de Convivencia / Jurídica.' },
  EN_INVESTIGACION: { label: 'En investigación', tone: 'info', nota: 'El caso está siendo investigado de forma confidencial.' },
  RESUELTA: { label: 'Resuelta', tone: 'ok', nota: 'El caso fue resuelto.' },
  ARCHIVADA: { label: 'Archivada', tone: 'muted', nota: 'El caso fue archivado.' },
}

function Campo({ label, obligatorio, children }: { label: string; obligatorio?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}{obligatorio && <span className="text-destructive"> *</span>}</Label>
      {children}
    </div>
  )
}

/** `mostrar` decide qué tarjetas se ven: solo el canal anti-acoso, solo habeas data, o ambas. */
export function CanalEtico({ mostrar = 'ambos' }: { mostrar?: 'anti-acoso' | 'habeas-data' | 'ambos' }) {
  const [dialogo, setDialogo] = useState<'denuncia' | 'habeas' | 'seguimiento' | null>(null)
  const [codigoCreado, setCodigoCreado] = useState<string | null>(null)
  const verAntiAcoso = mostrar !== 'habeas-data'
  const verHabeas = mostrar !== 'anti-acoso'
  return (
    <>
      <div className={mostrar === 'ambos' ? 'grid gap-3 sm:grid-cols-2' : 'grid gap-3'}>
        {/* Una línea por canal y los botones en fila; el nombre del canal ya
            está en el título de la página cuando se entra a uno solo. */}
        {verAntiAcoso && (
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-foreground text-background">
                  <ShieldAlert className="size-[18px]" />
                </span>
                <div className="min-w-0">
                  {mostrar === 'ambos' && <p className="text-sm font-bold">Línea ética</p>}
                  <p className="text-sm text-muted-foreground">Reportar irregularidades</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setDialogo('denuncia')}>Hacer un reporte</Button>
                <Button size="sm" onClick={() => setDialogo('seguimiento')}>
                  <Search className="size-4" /> Consultar con mi código
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        {verHabeas && (
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-foreground text-background">
                  <FileLock className="size-[18px]" />
                </span>
                <div className="min-w-0">
                  {mostrar === 'ambos' && <p className="text-sm font-bold">Habeas data</p>}
                  <p className="text-sm text-muted-foreground">Consulta o reclamo sobre tus datos personales.</p>
                </div>
              </div>
              <div className="mt-3">
                <Button size="sm" onClick={() => setDialogo('habeas')}>Radicar solicitud</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {dialogo === 'denuncia' && <DialogDenuncia onClose={() => setDialogo(null)} onCreada={(codigo) => { setDialogo(null); setCodigoCreado(codigo) }} />}
      {dialogo === 'habeas' && <DialogHabeas onClose={() => setDialogo(null)} />}
      {dialogo === 'seguimiento' && <DialogSeguimiento onClose={() => setDialogo(null)} />}
      {codigoCreado && <DialogCodigo codigo={codigoCreado} onClose={() => setCodigoCreado(null)} />}
    </>
  )
}

/** Muestra el código de seguimiento de forma persistente (no un toast efímero), con copiar. */
function DialogCodigo({ codigo, onClose }: { codigo: string; onClose: () => void }) {
  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigo)
      toast.success('Código copiado.')
    } catch {
      toast.error('No se pudo copiar; anótalo manualmente.')
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Denuncia enviada de forma confidencial</DialogTitle>
          <DialogDescription>
            Guarda este código: es tu <strong>única</strong> forma de consultar el estado de tu denuncia.
            No se registró quién la envió, así que el código no se puede recuperar después.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-center gap-3 rounded-lg border bg-muted/40 py-5">
          <span className="font-mono text-2xl font-bold tracking-widest">{codigo}</span>
          <Button size="sm" onClick={copiar}><Copy className="size-4" /> Copiar</Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Ya lo guardé</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Consulta del estado de un reporte por su código. */
function DialogSeguimiento({ onClose }: { onClose: () => void }) {
  const [codigo, setCodigo] = useState('')
  const [g, setG] = useState(false)
  const [resultado, setResultado] = useState<{ estado: string; radicadaEn: string; actualizadaEn: string; resolucion: string | null } | null>(null)

  async function consultar() {
    if (codigo.trim().length < 4) { toast.error('Escribe tu código de seguimiento (ej.: DA-1A2B3C4D).'); return }
    setG(true)
    const res = await consultarMiDenuncia({ codigo: codigo.trim() })
    setG(false)
    if (!res.ok) { setResultado(null); toast.error(res.error); return }
    setResultado(res.datos as typeof resultado)
  }

  const info = resultado ? ESTADO_DENUNCIA[resultado.estado] ?? ESTADO_DENUNCIA.RECIBIDA : null

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Consultar mi denuncia</DialogTitle>
          <DialogDescription>Solo necesitas el código que recibiste al enviarlo.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="DA-XXXXXXXX" className="font-mono" />
            <Button onClick={consultar} disabled={g}>{g ? <Spinner /> : <Search className="size-4" />} Consultar</Button>
          </div>

          {resultado && info && (
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">Estado</span>
                <Pill tone={info.tone}>{info.label}</Pill>
              </div>
              <p className="text-xs text-muted-foreground">{info.nota}</p>
              <p className="text-xs text-muted-foreground">
                Radicada el {formatFechaCorta(new Date(resultado.radicadaEn))} · última actualización {formatFechaCorta(new Date(resultado.actualizadaEn))}
              </p>
              {resultado.resolucion && (
                <div className="rounded-lg bg-muted/40 p-2.5 text-sm">
                  <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Resolución</p>
                  {resultado.resolucion}
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DialogDenuncia({ onClose, onCreada }: { onClose: () => void; onCreada: (codigo: string) => void }) {
  const router = useRouter()
  const [asunto, setAsunto] = useState('')
  const [hechos, setHechos] = useState('')
  const [fechaHechos, setFechaHechos] = useState('')
  // Evidencias: capturas, fotos, audios, PDF… varias, se suben tras crear el reporte.
  const [archivos, setArchivos] = useState<File[]>([])
  const inputArchivo = useRef<HTMLInputElement>(null)
  const [g, setG] = useState(false)

  async function enviar() {
    if (asunto.trim().length < 3) { toast.error('Escribe de qué se trata.'); return }
    if (hechos.trim().length < 10) { toast.error('Describe los hechos (mínimo 10 caracteres).'); return }
    if (archivos.length === 0) { toast.error('Adjunta al menos una evidencia (captura, foto, audio o PDF).'); return }
    setG(true)
    const res = await crearMiDenuncia({ asunto, hechos, fechaHechos: fechaHechos || undefined })
    if (!res.ok) { setG(false); toast.error(res.error); return }
    // Las evidencias van por su propio endpoint; la prueba de que son de este
    // reporte es el código.
    let fallidos = 0
    for (const archivo of archivos) {
      try {
        const fd = new FormData()
        fd.append('archivo', archivo)
        fd.append('codigo', res.datos.codigo)
        const up = await fetch('/api/linea-etica/soporte', { method: 'POST', body: fd })
        if (!up.ok) fallidos++
      } catch {
        fallidos++
      }
    }
    setG(false)
    if (fallidos > 0) toast.warning(`El reporte se envió, pero ${fallidos} de ${archivos.length} archivos no se pudieron adjuntar.`)
    // El código se muestra en un diálogo persistente (con copiar), no en un toast efímero.
    onCreada(res.datos.codigo)
    router.refresh()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Línea ética</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Campo label="¿De qué se trata?" obligatorio>
            <Input value={asunto} onChange={(e) => setAsunto(e.target.value)} maxLength={120} placeholder="Ej.: Gritos de un supervisor, faltante en caja…" />
          </Campo>
          <Campo label="Detalles" obligatorio><Textarea rows={5} value={hechos} onChange={(e) => setHechos(e.target.value)} placeholder="Qué pasó, quiénes, dónde y cuándo." /></Campo>
          <Campo label="Fecha de los hechos"><Input type="date" value={fechaHechos} onChange={(e) => setFechaHechos(e.target.value)} /></Campo>
          <Campo label="Evidencias" obligatorio>
            <input
              ref={inputArchivo}
              type="file"
              multiple
              accept="image/*,application/pdf,audio/*,video/*"
              className="hidden"
              onChange={(e) => { setArchivos((prev) => [...prev, ...Array.from(e.target.files ?? [])]); e.target.value = '' }}
            />
            {archivos.length > 0 && (
              <ul className="space-y-1 rounded-lg border p-2 text-xs">
                {archivos.map((a, i) => (
                  <li key={`${a.name}-${i}`} className="flex items-center gap-2">
                    <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{a.name}</span>
                    <button type="button" onClick={() => setArchivos((prev) => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive" aria-label="Quitar"><X className="size-3.5" /></button>
                  </li>
                ))}
              </ul>
            )}
            <Button type="button" size="sm" className="w-full justify-start" onClick={() => inputArchivo.current?.click()}>
              <Paperclip className="size-4" /> {archivos.length > 0 ? 'Agregar otro archivo' : 'Adjuntar capturas, fotos, audios o PDF'}
            </Button>
          </Campo>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={enviar} disabled={g}>{g && <Spinner />}Enviar reporte</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DialogHabeas({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [tipo, setTipo] = useState<'CONSULTA' | 'RECLAMO'>('CONSULTA')
  const [descripcion, setDescripcion] = useState('')
  const [g, setG] = useState(false)

  async function enviar() {
    if (descripcion.trim().length < 5) { toast.error('Describe tu consulta o reclamo.'); return }
    setG(true)
    const res = await crearMiConsultaReclamo({ tipo, descripcion })
    setG(false)
    if (res.ok) {
      toast.success('Solicitud radicada. Recibirás respuesta dentro del plazo legal.')
      onClose()
      router.refresh()
    } else {
      toast.error(res.error)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Consulta o reclamo sobre tus datos</DialogTitle>
          <DialogDescription>Recibirás respuesta en el plazo indicado.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Campo label="Tipo" obligatorio>
            <Select value={tipo} onValueChange={(v) => setTipo(v as 'CONSULTA' | 'RECLAMO')}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CONSULTA">Consulta (respuesta en 10 días hábiles)</SelectItem>
                <SelectItem value="RECLAMO">Reclamo (respuesta en 15 días hábiles)</SelectItem>
              </SelectContent>
            </Select>
          </Campo>
          <Campo label="¿Qué necesitas?" obligatorio><Textarea rows={4} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ej.: solicito conocer qué datos míos tienen, corregir un dato, o eliminar información." /></Campo>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={enviar} disabled={g}>{g && <Spinner />}Radicar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
