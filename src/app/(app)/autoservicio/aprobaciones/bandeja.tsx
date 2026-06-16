'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, X, CalendarClock, Paperclip } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { resolverPaso } from '../acciones'

type Solicitud = {
  id: string; pasoId: string; tipo: string; esPasoJefe: boolean; colaborador: string; sede: string
  creadoEn: string; detalle: string; fechaInicio: string; fechaFin: string
  documentos: { id: string; nombre: string }[]
}
const TIPO: Record<string, string> = { VACACIONES: 'Vacaciones', PERMISO: 'Permiso', INCAPACIDAD: 'Incapacidad', CERTIFICACION_LABORAL: 'Certificación', LICENCIA: 'Licencia' }

export function BandejaAprobaciones({ solicitudes }: { solicitudes: Solicitud[] }) {
  const router = useRouter()
  const [procesando, setProcesando] = useState<string | null>(null)
  const [cambioFechas, setCambioFechas] = useState<string | null>(null) // pasoId con el formulario abierto
  const [comentario, setComentario] = useState('')
  const [nuevaIni, setNuevaIni] = useState('')
  const [nuevaFin, setNuevaFin] = useState('')

  async function resolver(pasoId: string, aprobar: boolean, conFechas = false) {
    setProcesando(pasoId)
    const res = await resolverPaso({
      pasoId, aprobar, comentario: comentario || undefined,
      nuevaFechaInicio: conFechas ? nuevaIni : undefined,
      nuevaFechaFin: conFechas ? nuevaFin : undefined,
    })
    setProcesando(null)
    if (res.ok) {
      toast.success(aprobar ? (conFechas ? 'Aprobada con nuevas fechas.' : 'Aprobada.') : 'Rechazada.')
      setCambioFechas(null); setComentario(''); setNuevaIni(''); setNuevaFin('')
      router.refresh()
    } else toast.error(res.error)
  }

  return (
    <div className="space-y-3">
      {solicitudes.map((s) => (
        <Card key={s.id}>
          <CardContent className="py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{s.colaborador}</p>
                  <Badge variant="outline">{TIPO[s.tipo]}</Badge>
                  <Badge variant="secondary" className="text-[10px]">{s.esPasoJefe ? 'Jefe inmediato' : 'Talento Humano'}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{s.detalle}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.sede} · {s.creadoEn}</p>
                {s.documentos.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {s.documentos.map((d) => (
                      <a key={d.id} href={`/api/documentos/${d.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        <Paperclip className="size-3.5" /> {d.nombre}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Formulario de cambio de fechas (solo el jefe inmediato) */}
            {cambioFechas === s.pasoId ? (
              <div className="mt-3 rounded-lg border p-3 space-y-3">
                <p className="text-sm font-medium">{s.tipo === 'PERMISO' ? 'Aprobar proponiendo otro día' : 'Aprobar proponiendo otras fechas'}</p>
                {s.tipo === 'PERMISO' ? (
                  <div className="space-y-1.5"><Label>Nuevo día</Label><Input type="date" value={nuevaIni} onChange={(e) => setNuevaIni(e.target.value)} /></div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label>Nueva fecha inicio</Label><Input type="date" value={nuevaIni} onChange={(e) => setNuevaIni(e.target.value)} /></div>
                    <div className="space-y-1.5"><Label>Nueva fecha fin</Label><Input type="date" value={nuevaFin} onChange={(e) => setNuevaFin(e.target.value)} /></div>
                  </div>
                )}
                <Textarea rows={2} placeholder="Comentario para el colaborador (opcional)" value={comentario} onChange={(e) => setComentario(e.target.value)} />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => { setCambioFechas(null); setNuevaIni(''); setNuevaFin('') }}>Cancelar</Button>
                  <Button size="sm" onClick={() => resolver(s.pasoId, true, true)} disabled={procesando === s.pasoId || (!nuevaIni && !nuevaFin)}>
                    {procesando === s.pasoId ? <Spinner /> : <Check className="size-4" />} Aprobar con estas fechas
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap justify-end gap-2 mt-3">
                <Button size="sm" variant="outline" onClick={() => resolver(s.pasoId, false)} disabled={procesando === s.pasoId}>
                  <X className="size-4" /> Rechazar
                </Button>
                {s.esPasoJefe && (s.tipo === 'PERMISO' || s.tipo === 'VACACIONES') && (
                  <Button size="sm" variant="outline" onClick={() => { setCambioFechas(s.pasoId); setNuevaIni(s.fechaInicio); setNuevaFin(s.fechaFin) }} disabled={procesando === s.pasoId}>
                    <CalendarClock className="size-4" /> Aprobar con otras fechas
                  </Button>
                )}
                <Button size="sm" onClick={() => resolver(s.pasoId, true)} disabled={procesando === s.pasoId}>
                  {procesando === s.pasoId ? <Spinner /> : <Check className="size-4" />} Aprobar
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
