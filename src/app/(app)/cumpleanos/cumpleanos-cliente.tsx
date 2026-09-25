'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Cake, UserPlus, UserPen, Eye, CircleCheck, Undo2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Pill, enfocarDialogo, type PillTone } from '@/components/ui-kit'
import { SelectorColaborador } from '@/components/colaboradores/selector-colaborador'
import { SoportesLista, type SoporteDoc } from '@/app/(app)/juridica/_ui'
import { colorAvatar, iniciales } from '@/lib/etiquetas'
import { fmtCOP } from '@/lib/moneda'
import { formatFechaCorta, parseFechaISO } from '@/lib/fechas'
import { fechaBreve } from '@/lib/notificaciones/texto'
import { asignarEncargadoCumpleanos, cancelarCelebracionCumpleanos, revisarFacturasCumpleanos } from './acciones'
import { urlFoto } from '@/lib/foto'

export type CelebracionItem = {
  id: string
  estado: 'ASIGNADA' | 'FACTURAS_ENTREGADAS' | 'CERRADA'
  encargado: { id: string; nombre: string }
  nota: string | null
  valorReportado: number | null
  motivoDevolucion: string | null
  facturasEntregadasEn: string | null
  facturas: SoporteDoc[]
}

export type FilaCumpleanos = {
  clave: string
  colaborador: { id: string; nombres: string; apellidos: string; fotoPath: string | null; sede: string; cargo: string | null }
  /** ISO del día que cumple este año. */
  fecha: string
  anio: number
  edad: number | null
  pasado: boolean
  celebracion: CelebracionItem | null
}

type Permisos = { crear: boolean; editar: boolean; eliminar: boolean }

const ESTADO: Record<CelebracionItem['estado'], { texto: string; tono: PillTone }> = {
  ASIGNADA: { texto: 'Encargado asignado', tono: 'info' },
  FACTURAS_ENTREGADAS: { texto: 'Facturas por revisar', tono: 'warn' },
  CERRADA: { texto: 'Cerrada', tono: 'ok' },
}

function AvatarColab({ c }: { c: FilaCumpleanos['colaborador'] }) {
  return (
    <Avatar className="size-9 shrink-0">
      {c.fotoPath && <AvatarImage src={urlFoto(c.id, c.fotoPath, true)!} alt="" />}
      <AvatarFallback className="text-[11px] font-semibold text-white" style={{ backgroundColor: colorAvatar(`${c.nombres} ${c.apellidos}`) }}>
        {iniciales(c.nombres, c.apellidos)}
      </AvatarFallback>
    </Avatar>
  )
}

/** "Septiembre 2026", para agrupar la lista. */
function mesDe(iso: string): string {
  const d = parseFechaISO(iso)!
  const texto = new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(d)
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/**
 * Lista de cumpleaños con el estado de su celebración y las acciones de TH:
 * asignar (o cambiar) encargado, revisar las facturas, cancelar un encargo que
 * no llegó a nada. Cada acción abre una ventana centrada.
 */
export function CumpleanosCliente({ filas, rezagadas, hoy, sinFechaNacimiento, permisos }: {
  filas: FilaCumpleanos[]
  rezagadas: FilaCumpleanos[]
  hoy: string
  sinFechaNacimiento: number
  permisos: Permisos
}) {
  const [asignar, setAsignar] = useState<FilaCumpleanos | null>(null)
  const [revisar, setRevisar] = useState<FilaCumpleanos | null>(null)

  const meses = new Map<string, FilaCumpleanos[]>()
  for (const f of filas) {
    const m = mesDe(f.fecha)
    meses.set(m, [...(meses.get(m) ?? []), f])
  }

  return (
    <div className="space-y-6">
      {sinFechaNacimiento > 0 && (
        <p className="text-xs text-muted-foreground" title="No aparecen aquí hasta completar la ficha">
          {sinFechaNacimiento} sin fecha de nacimiento
        </p>
      )}

      {rezagadas.length > 0 && (
        <section>
          <h2 className="mb-2 text-[13px] font-bold">Facturas por revisar de meses anteriores</h2>
          <Lista filas={rezagadas} hoy={hoy} permisos={permisos} onAsignar={setAsignar} onRevisar={setRevisar} />
        </section>
      )}

      {filas.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
          <Cake className="size-8" />
          <p>No hay cumpleaños en este mes ni en el siguiente.</p>
        </CardContent></Card>
      ) : (
        Array.from(meses.entries()).map(([mes, lista]) => (
          <section key={mes}>
            <h2 className="mb-2 text-[13px] font-bold">{mes}</h2>
            <Lista filas={lista} hoy={hoy} permisos={permisos} onAsignar={setAsignar} onRevisar={setRevisar} />
          </section>
        ))
      )}

      {asignar && <AsignarDialogo fila={asignar} onClose={() => setAsignar(null)} />}
      {revisar && <RevisarDialogo fila={revisar} permisos={permisos} onClose={() => setRevisar(null)} />}
    </div>
  )
}

function Lista({ filas, hoy, permisos, onAsignar, onRevisar }: {
  filas: FilaCumpleanos[]
  hoy: string
  permisos: Permisos
  onAsignar: (f: FilaCumpleanos) => void
  onRevisar: (f: FilaCumpleanos) => void
}) {
  const router = useRouter()
  const [cancelando, setCancelando] = useState<string | null>(null)

  async function cancelar(f: FilaCumpleanos) {
    if (!f.celebracion) return
    if (!confirm(`¿Quitar el encargo del cumpleaños de ${f.colaborador.nombres}?`)) return
    setCancelando(f.clave)
    const res = await cancelarCelebracionCumpleanos({ id: f.celebracion.id })
    setCancelando(null)
    if (res.ok) { toast.success('Encargo cancelado.'); router.refresh() } else toast.error(res.error)
  }

  return (
    <Card className="py-0"><CardContent className="divide-y p-0">
      {filas.map((f) => {
        const c = f.celebracion
        const esHoy = f.fecha === hoy
        return (
          // Una fila: foto, nombre y debajo fecha corta · edad · estado; las
          // acciones a la derecha (solo ícono en el celular). El mes ya va en el
          // título del grupo, y sede y cargo solo en pantallas anchas.
          <div key={f.clave} className="flex items-center gap-3 p-3">
            <AvatarColab c={f.colaborador} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{f.colaborador.nombres} {f.colaborador.apellidos}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
                <span className={esHoy ? 'font-semibold text-rose-600 dark:text-rose-400' : undefined}>
                  {esHoy ? 'Hoy' : fechaBreve(parseFechaISO(f.fecha)!)}
                </span>
                {f.edad != null && <span>· {f.edad} años</span>}
                <span className="hidden sm:inline">· {f.colaborador.sede}{f.colaborador.cargo ? ` · ${f.colaborador.cargo}` : ''}</span>
                {c ? (
                  <Pill tone={ESTADO[c.estado].tono}>{ESTADO[c.estado].texto}</Pill>
                ) : (
                  <Pill tone={f.pasado ? 'muted' : 'warn'}>Sin encargado</Pill>
                )}
              </div>
              {c && <p className="mt-0.5 truncate text-xs text-muted-foreground">Encargado: <span className="text-foreground">{c.encargado.nombre}</span></p>}
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {!c && permisos.crear && (
                <Button size="sm" onClick={() => onAsignar(f)} aria-label={`Asignar encargado a ${f.colaborador.nombres} ${f.colaborador.apellidos}`} title="Asignar encargado">
                  <UserPlus className="size-4" /> <span className="hidden sm:inline">Asignar encargado</span>
                </Button>
              )}
              {c?.estado === 'ASIGNADA' && permisos.crear && (
                <Button size="sm" variant="outline" onClick={() => onAsignar(f)} aria-label="Cambiar encargado" title="Cambiar encargado">
                  <UserPen className="size-4" /> <span className="hidden sm:inline">Cambiar</span>
                </Button>
              )}
              {c?.estado === 'ASIGNADA' && permisos.eliminar && (
                <Button size="sm" variant="ghost" onClick={() => cancelar(f)} disabled={cancelando === f.clave} aria-label="Cancelar el encargo">
                  {cancelando === f.clave ? <Spinner className="size-4" /> : <Trash2 className="size-4" />}
                </Button>
              )}
              {c?.estado === 'FACTURAS_ENTREGADAS' && (
                <Button size="sm" onClick={() => onRevisar(f)} aria-label="Revisar facturas" title="Revisar facturas"><Eye className="size-4" /> <span className="hidden sm:inline">Revisar facturas</span></Button>
              )}
              {c?.estado === 'CERRADA' && (
                <Button size="sm" variant="outline" onClick={() => onRevisar(f)} aria-label="Ver facturas" title="Ver facturas"><Eye className="size-4" /> <span className="hidden sm:inline">Ver facturas</span></Button>
              )}
            </div>
          </div>
        )
      })}
    </CardContent></Card>
  )
}

function AsignarDialogo({ fila, onClose }: { fila: FilaCumpleanos; onClose: () => void }) {
  const router = useRouter()
  const [guardando, empezar] = useTransition()
  const [encargadoId, setEncargadoId] = useState(fila.celebracion?.encargado.id ?? '')
  const [nota, setNota] = useState(fila.celebracion?.nota ?? '')

  function guardar() {
    if (!encargadoId) { toast.error('Elige al encargado.'); return }
    empezar(async () => {
      const res = await asignarEncargadoCumpleanos({ colaboradorId: fila.colaborador.id, anio: fila.anio, encargadoId, nota })
      if (!res.ok) { toast.error(res.error); return }
      toast.success('Encargado asignado. Ya recibió el aviso.')
      onClose()
      router.refresh()
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent onOpenAutoFocus={enfocarDialogo} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{fila.celebracion ? 'Cambiar encargado' : 'Asignar encargado'}</DialogTitle>
          <DialogDescription>
            Cumpleaños de {fila.colaborador.nombres} {fila.colaborador.apellidos}, el {formatFechaCorta(parseFechaISO(fila.fecha))}. El encargado organiza la celebración y después sube las facturas desde su autoservicio.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Encargado</Label>
            <SelectorColaborador value={encargadoId} onChange={setEncargadoId} placeholder="Busca por nombre o documento…" />
            <p className="text-[11px] text-muted-foreground">Necesita usuario de acceso: sube las facturas desde su autoservicio.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Indicaciones (opcional)</Label>
            <Textarea rows={3} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Qué comprar, presupuesto orientativo, dónde se celebra…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando}>{guardando ? <Spinner className="size-4" /> : <UserPlus className="size-4" />} {fila.celebracion ? 'Guardar cambio' : 'Asignar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RevisarDialogo({ fila, permisos, onClose }: { fila: FilaCumpleanos; permisos: Permisos; onClose: () => void }) {
  const router = useRouter()
  const [guardando, empezar] = useTransition()
  const [motivo, setMotivo] = useState('')
  const c = fila.celebracion!
  const porRevisar = c.estado === 'FACTURAS_ENTREGADAS' && permisos.editar

  function decidir(decision: 'ACEPTAR' | 'DEVOLVER') {
    if (decision === 'DEVOLVER' && !motivo.trim()) { toast.error('Indica qué hay que corregir.'); return }
    empezar(async () => {
      const res = await revisarFacturasCumpleanos({ id: c.id, decision, motivo })
      if (!res.ok) { toast.error(res.error); return }
      toast.success(decision === 'ACEPTAR' ? 'Facturas aceptadas. Celebración cerrada.' : 'Facturas devueltas. El encargado recibió el motivo.')
      onClose()
      router.refresh()
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent onOpenAutoFocus={enfocarDialogo} className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{porRevisar ? 'Revisar facturas' : 'Facturas del cumpleaños'}</DialogTitle>
          <DialogDescription>
            Cumpleaños de {fila.colaborador.nombres} {fila.colaborador.apellidos} ({formatFechaCorta(parseFechaISO(fila.fecha))}), a cargo de {c.encargado.nombre}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
            <div><p className="text-xs text-muted-foreground">Valor reportado</p><p className="font-medium tabular-nums">{c.valorReportado != null ? fmtCOP(c.valorReportado) : '—'}</p></div>
            <div><p className="text-xs text-muted-foreground">Entregadas</p><p className="font-medium">{c.facturasEntregadasEn ? formatFechaCorta(parseFechaISO(c.facturasEntregadasEn)) : '—'}</p></div>
            {c.nota && <div className="sm:col-span-2"><p className="text-xs text-muted-foreground">Indicaciones dadas</p><p>{c.nota}</p></div>}
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Facturas ({c.facturas.length})</p>
            {c.facturas.length === 0 ? <p className="mt-1 text-xs text-muted-foreground">Sin archivos.</p> : <SoportesLista documentos={c.facturas} />}
          </div>
          {porRevisar && (
            <div className="space-y-1.5">
              <Label>Motivo si las devuelves</Label>
              <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Falta la factura de la torta, el valor no coincide…" />
            </div>
          )}
        </div>
        <DialogFooter>
          {porRevisar ? (
            <>
              <Button onClick={() => decidir('DEVOLVER')} disabled={guardando}><Undo2 className="size-4" /> Devolver</Button>
              <Button onClick={() => decidir('ACEPTAR')} disabled={guardando}>{guardando ? <Spinner className="size-4" /> : <CircleCheck className="size-4" />} Aceptar y cerrar</Button>
            </>
          ) : (
            <Button onClick={onClose}>Cerrar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
