'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Paperclip, RefreshCw } from 'lucide-react'
import { reducirImagen } from '@/lib/reducir-imagen'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DialogAnular, BotonAnular, BotonEditar } from '@/components/contratos/dialog-anular'
import { editarCuentaCobro, anularCuentaCobro, reemplazarSoporteSs, eliminarSoporteSs } from '@/app/(app)/contratos/ops-acciones'
import { fmtCOP } from '@/lib/moneda'

export type CuentaEditable = {
  id: string
  numero: string
  periodo: string
  valor: number
  fechaRadicacion: string
  concepto: string | null
  estado: string
  /** La radicó el contratista (su PDF lleva su firma): valor y periodo no se cambian. */
  creadaPorContratista: boolean
}

/** Por qué no se puede editar/anular, o null si se puede. El botón se ve igual. */
export function bloqueoCuenta(c: { estado: string; numero: string }): string | null {
  return c.estado === 'PAGADA' ? `La cuenta ${c.numero} ya está pagada: no se puede cambiar ni anular.` : null
}

/** Lápiz + anular de una cuenta de cobro, para las dos listas de administración. */
export function AccionesCuentaCobro({ cuenta, puedeEditar, puedeEliminar }: { cuenta: CuentaEditable; puedeEditar: boolean; puedeEliminar: boolean }) {
  const [dialogo, setDialogo] = useState<'editar' | 'anular' | null>(null)
  const bloqueo = bloqueoCuenta(cuenta)
  return (
    <>
      {puedeEditar && <BotonEditar onClick={() => setDialogo('editar')} motivoBloqueo={bloqueo} etiqueta="Editar cuenta de cobro" />}
      {puedeEliminar && <BotonAnular onClick={() => setDialogo('anular')} motivoBloqueo={bloqueo} etiqueta="Anular cuenta de cobro" soloIcono />}
      {dialogo === 'editar' && <DialogEditarCuenta cuenta={cuenta} onClose={() => setDialogo(null)} />}
      {dialogo === 'anular' && (
        <DialogAnular
          titulo={`Anular cuenta ${cuenta.numero}`}
          detalle={`Periodo ${cuenta.periodo} · ${fmtCOP(cuenta.valor)} · se borran su PDF, la planilla PILA y el soporte de seguridad social.`}
          nota="· al titular se le avisa."
          mensajeOk="Anulada. Se le avisó al titular."
          accion={(motivo) => anularCuentaCobro({ id: cuenta.id, motivo })}
          onClose={() => setDialogo(null)}
        />
      )}
    </>
  )
}

function DialogEditarCuenta({ cuenta, onClose }: { cuenta: CuentaEditable; onClose: () => void }) {
  const router = useRouter()
  const [periodo, setPeriodo] = useState(cuenta.periodo)
  const [valor, setValor] = useState(String(cuenta.valor))
  const [fecha, setFecha] = useState(cuenta.fechaRadicacion)
  const [concepto, setConcepto] = useState(cuenta.concepto ?? '')
  const [g, setG] = useState(false)
  const firmada = cuenta.creadaPorContratista

  async function guardar() {
    setG(true)
    const res = await editarCuentaCobro({ id: cuenta.id, periodo, valor: Number(valor), fechaRadicacion: fecha, concepto })
    setG(false)
    if (res.ok) { toast.success('Cuenta actualizada.'); onClose(); router.refresh() } else toast.error(res.error, { duration: 8000 })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !g && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar cuenta {cuenta.numero}</DialogTitle>
          <DialogDescription>
            {firmada
              ? 'La radicó el contratista con su firma: el valor y el periodo no se cambian (anúlala y pídele una nueva). El concepto y la fecha sí.'
              : 'La cuenta la generó la empresa: el PDF se rehace con los datos corregidos.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="ec-periodo">Periodo (AAAA-MM) <span className="text-destructive">*</span></Label><Input id="ec-periodo" value={periodo} disabled={firmada} onChange={(e) => setPeriodo(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="ec-valor">Valor <span className="text-destructive">*</span></Label><Input id="ec-valor" type="number" value={valor} disabled={firmada} onChange={(e) => setValor(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="ec-fecha">Fecha de radicación <span className="text-destructive">*</span></Label><Input id="ec-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="ec-concepto">Concepto</Label><Textarea id="ec-concepto" rows={2} value={concepto} onChange={(e) => setConcepto(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={g}>Cancelar</Button>
          <Button onClick={guardar} disabled={g || !periodo || !valor || !fecha}>{g && <Spinner />}Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Reemplazar o eliminar el soporte de seguridad social (datos declarados y
 * planilla PILA) de una cuenta aún no aprobada. Reemplazar sube la planilla
 * nueva por la misma ruta que usa el contratista desde su autoservicio.
 */
export function AccionesSoporteSs({ cuenta, soporte, puedeEditar, puedeEliminar }: {
  cuenta: { id: string; numero: string; periodo: string; estado: string }
  soporte: { periodoCotizado: string; operador: string | null; ibcDeclarado: number | null } | null
  puedeEditar: boolean
  puedeEliminar: boolean
}) {
  const [dialogo, setDialogo] = useState<'reemplazar' | 'eliminar' | null>(null)
  const bloqueo = cuenta.estado === 'APROBADA' || cuenta.estado === 'PAGADA'
    ? `La cuenta ${cuenta.numero} ya se aprobó con este soporte: no se cambia.`
    : null
  if (!soporte) return null
  return (
    <>
      {puedeEditar && (
        <Button size="sm" variant="ghost" className="h-7" onClick={() => setDialogo('reemplazar')} disabled={!!bloqueo} title={bloqueo ?? 'Reemplazar la planilla y los datos declarados'}>
          <RefreshCw className="size-3.5" /> Reemplazar
        </Button>
      )}
      {puedeEliminar && <BotonAnular onClick={() => setDialogo('eliminar')} motivoBloqueo={bloqueo} etiqueta="Eliminar soporte de seguridad social" icono="eliminar" soloIcono />}
      {dialogo === 'reemplazar' && <DialogReemplazarSoporte cuenta={cuenta} soporte={soporte} onClose={() => setDialogo(null)} />}
      {dialogo === 'eliminar' && (
        <DialogAnular
          titulo="Eliminar soporte de seguridad social"
          detalle={`Cuenta ${cuenta.numero} · periodo cotizado ${soporte.periodoCotizado} · se borran los datos declarados y la planilla adjunta.`}
          verbo="Eliminar"
          mensajeOk="Soporte eliminado."
          accion={(motivo) => eliminarSoporteSs({ cuentaCobroId: cuenta.id, motivo })}
          onClose={() => setDialogo(null)}
        />
      )}
    </>
  )
}

function DialogReemplazarSoporte({ cuenta, soporte, onClose }: {
  cuenta: { id: string; numero: string; periodo: string }
  soporte: { periodoCotizado: string; operador: string | null; ibcDeclarado: number | null }
  onClose: () => void
}) {
  const router = useRouter()
  const [periodo, setPeriodo] = useState(soporte.periodoCotizado)
  const [operador, setOperador] = useState(soporte.operador ?? '')
  const [ibc, setIbc] = useState(soporte.ibcDeclarado != null ? String(soporte.ibcDeclarado) : '')
  const [motivo, setMotivo] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const [g, setG] = useState(false)

  async function guardar() {
    if (!archivo) { toast.error('Adjunta la planilla nueva.'); return }
    setG(true)
    const res = await reemplazarSoporteSs({ cuentaCobroId: cuenta.id, periodoCotizado: periodo, operador, ibcDeclarado: ibc ? Number(ibc) : undefined, motivo })
    if (!res.ok) { setG(false); toast.error(res.error, { duration: 8000 }); return }
    try {
      const fd = new FormData()
      fd.append('archivo', await reducirImagen(archivo))
      fd.append('entidadTipo', 'CuentaCobroOps')
      fd.append('entidadId', cuenta.id)
      fd.append('nombre', `Planilla PILA — ${periodo}`)
      const up = await fetch('/api/documentos/subir', { method: 'POST', body: fd })
      if (!up.ok) toast.warning('El soporte se reemplazó, pero el archivo no se pudo subir. Intenta adjuntarlo de nuevo.')
    } catch {
      toast.warning('El soporte se reemplazó, pero el archivo no se pudo subir. Intenta adjuntarlo de nuevo.')
    }
    setG(false)
    toast.success('Soporte reemplazado. Queda pendiente de verificar.')
    onClose()
    router.refresh()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !g && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reemplazar soporte de seguridad social</DialogTitle>
          <DialogDescription>Cuenta {cuenta.numero} · la planilla anterior se borra y la verificación vuelve a pendiente.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="rs-periodo">Periodo cotizado (AAAA-MM) <span className="text-destructive">*</span></Label><Input id="rs-periodo" value={periodo} onChange={(e) => setPeriodo(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="rs-ibc">IBC declarado</Label><Input id="rs-ibc" type="number" value={ibc} onChange={(e) => setIbc(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="rs-operador">Operador PILA</Label><Input id="rs-operador" value={operador} onChange={(e) => setOperador(e.target.value)} placeholder="Aportes en Línea, SOI…" /></div>
          <div className="space-y-1.5">
            <Label>Planilla nueva <span className="text-destructive">*</span></Label>
            <input ref={input} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
            <Button type="button" size="sm" variant="outline" className="w-full justify-start" onClick={() => input.current?.click()}>
              <Paperclip className="size-4" /> <span className="truncate">{archivo ? archivo.name : 'Adjuntar PDF o imagen'}</span>
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rs-motivo">Motivo <span className="text-destructive">*</span></Label>
            <Textarea id="rs-motivo" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="¿Por qué se reemplaza?" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={g}>Cancelar</Button>
          <Button onClick={guardar} disabled={g || !archivo || !periodo || motivo.trim().length < 5}>{g ? <Spinner /> : <RefreshCw className="size-4" />} Reemplazar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
