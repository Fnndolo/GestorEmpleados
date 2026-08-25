'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ShieldAlert, FileLock, Lock, Copy, Search } from 'lucide-react'
import { Pill, type PillTone } from '@/components/ui-kit'
import { formatFechaCorta } from '@/lib/fechas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { crearMiDenuncia, crearMiConsultaReclamo, consultarMiDenuncia } from '../juridica-acciones'
import { TIPOS_REPORTE, type TipoReporte } from '@/lib/linea-etica'
import { cn } from '@/lib/utils'

const ESTADO_DENUNCIA: Record<string, { label: string; tone: PillTone; nota: string }> = {
  RECIBIDA: { label: 'Recibida', tone: 'warn', nota: 'Tu denuncia fue recibida y está pendiente de revisión por el Comité de Convivencia / Jurídica.' },
  EN_INVESTIGACION: { label: 'En investigación', tone: 'info', nota: 'El caso está siendo investigado de forma confidencial.' },
  RESUELTA: { label: 'Resuelta', tone: 'ok', nota: 'El caso fue resuelto.' },
  ARCHIVADA: { label: 'Archivada', tone: 'muted', nota: 'El caso fue archivado.' },
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>
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
        {verAntiAcoso && (
          <Card className="transition-colors hover:border-primary/40">
            <CardContent className="flex flex-col gap-2 py-5">
              <ShieldAlert className="size-7 text-amber-600" />
              <h3 className="font-medium">Línea ética</h3>
              <p className="flex-1 text-sm text-muted-foreground">Reporta acoso laboral o sexual, conductas indebidas, irregularidades o sugerencias. Puede ser anónimo y se maneja con estricta confidencialidad (Ley 2466 de 2025).</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" className="w-fit" onClick={() => setDialogo('denuncia')}>Hacer un reporte</Button>
                <Button size="sm" variant="outline" className="w-fit" onClick={() => setDialogo('seguimiento')}>
                  <Search className="size-4" /> Consultar con mi código
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        {verHabeas && (
          <Card className="transition-colors hover:border-primary/40">
            <CardContent className="flex flex-col gap-2 py-5">
              <FileLock className="size-7 text-blue-600" />
              <h3 className="font-medium">Habeas data</h3>
              <p className="flex-1 text-sm text-muted-foreground">Consulta o reclama sobre el tratamiento de tus datos personales (Ley 1581 de 2012). Recibirás respuesta en el plazo legal.</p>
              <Button size="sm" variant="outline" className="w-fit" onClick={() => setDialogo('habeas')}>Radicar solicitud</Button>
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
          <Button size="sm" variant="outline" onClick={copiar}><Copy className="size-4" /> Copiar</Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Ya lo guardé</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Consulta anónima del estado de una denuncia por su código. */
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
          <DialogDescription>La consulta es anónima: solo necesitas el código que recibiste al enviarla.</DialogDescription>
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
  const [anonima, setAnonima] = useState(true)
  const [tipo, setTipo] = useState<TipoReporte>('ACOSO_LABORAL')
  const [nombre, setNombre] = useState('')
  const [hechos, setHechos] = useState('')
  const [fechaHechos, setFechaHechos] = useState('')
  const [g, setG] = useState(false)

  async function enviar() {
    if (hechos.trim().length < 10) { toast.error('Describe los hechos (mínimo 10 caracteres).'); return }
    setG(true)
    const res = await crearMiDenuncia({ tipo, anonima, denuncianteNombre: anonima ? undefined : nombre, hechos, fechaHechos: fechaHechos || undefined })
    setG(false)
    if (res.ok) {
      // El código se muestra en un diálogo persistente (con copiar), no en un toast efímero.
      onCreada(res.datos.codigo)
      router.refresh()
    } else {
      toast.error(res.error)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Línea ética</DialogTitle>
          <DialogDescription>Solo el Comité de Convivencia y Jurídica acceden al contenido.</DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
          <Lock className="mt-0.5 size-4 shrink-0" />
          <span>Tu reporte es confidencial: <strong>no se registra quién lo envía</strong>. Si lo marcas anónimo, tampoco se guarda tu nombre. Anota el código que verás al enviarlo para dar seguimiento.</span>
        </div>

        <div className="space-y-4">
          {/* El tipo decide el camino: los dos de acoso van al Comité de
              Convivencia con el procedimiento de la Ley 1010; los demás no. */}
          <Campo label="¿Qué quieres reportar?">
            <div className="grid gap-2">
              {TIPOS_REPORTE.map((t) => (
                <button
                  key={t.valor}
                  type="button"
                  onClick={() => setTipo(t.valor)}
                  className={cn(
                    'rounded-lg border p-2.5 text-left transition',
                    tipo === t.valor ? 'border-primary bg-accent' : 'hover:border-foreground/20',
                  )}
                >
                  <p className="text-sm font-medium">{t.etiqueta}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t.ayuda}</p>
                </button>
              ))}
            </div>
          </Campo>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={anonima} onCheckedChange={(v) => setAnonima(Boolean(v))} /> Enviar de forma anónima</label>
          {!anonima && <Campo label="Tu nombre (opcional)"><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></Campo>}
          <Campo label="¿Qué ocurrió?"><Textarea rows={5} value={hechos} onChange={(e) => setHechos(e.target.value)} placeholder="Describe los hechos, personas involucradas, lugar y contexto." /></Campo>
          <Campo label="Fecha de los hechos (opcional)"><Input type="date" value={fechaHechos} onChange={(e) => setFechaHechos(e.target.value)} /></Campo>
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
          <DialogTitle>Consulta o reclamo (habeas data)</DialogTitle>
          <DialogDescription>Ley 1581 de 2012 — derechos sobre tus datos personales.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Campo label="Tipo">
            <Select value={tipo} onValueChange={(v) => setTipo(v as 'CONSULTA' | 'RECLAMO')}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CONSULTA">Consulta (respuesta en 10 días hábiles)</SelectItem>
                <SelectItem value="RECLAMO">Reclamo (respuesta en 15 días hábiles)</SelectItem>
              </SelectContent>
            </Select>
          </Campo>
          <Campo label="¿Qué necesitas?"><Textarea rows={4} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ej.: solicito conocer qué datos míos tienen, corregir un dato, o eliminar información." /></Campo>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={enviar} disabled={g}>{g && <Spinner />}Radicar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
