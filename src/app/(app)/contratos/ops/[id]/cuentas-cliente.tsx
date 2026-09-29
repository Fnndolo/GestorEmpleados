'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ShieldCheck, ShieldAlert, ShieldQuestionMark, CircleCheck, CircleX, Ban, Eye, Receipt, Ellipsis } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Pill } from '@/components/ui-kit'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { fmtCOP } from '@/lib/moneda'
import { formatFechaCorta } from '@/lib/fechas'
import { registrarSoporteSs, cambiarEstadoCuenta } from '../../ops-acciones'

type Soporte = { estadoVerificacion: string; periodoCotizado: string; ibcDeclarado: number | null; operador: string | null }
type Planilla = { id: string; nombre: string; esImagen: boolean }
type Cuenta = {
  id: string; numero: string; periodo: string; valor: number; estado: string
  fechaRadicacion: string; fechaPago: string | null; soporte: Soporte | null; planilla: Planilla | null
  /** Se le pidió la planilla PILA: sin ella verificada no se aprueba ni se paga. */
  requierePila: boolean
}

const ESTADO_SS: Record<string, string> = { VALIDA: 'válida', INVALIDA: 'inválida', PENDIENTE: 'pendiente' }

const ESTADO_LABEL: Record<string, string> = {
  RADICADA: 'Radicada', EN_VERIFICACION_SS: 'En verificación', BLOQUEADA_SS: 'Bloqueada (SS)',
  APROBADA: 'Aprobada', PAGADA: 'Pagada', RECHAZADA: 'Rechazada',
}

export function CuentasCobro({
  contratoOpsId, valorMensual, cuentas, puedeEditar, puedeAprobar,
}: {
  contratoOpsId: string; valorMensual: number | null; cuentas: Cuenta[]
  puedeEditar: boolean; puedeAprobar: boolean
}) {
  const router = useRouter()
  const [soporteDe, setSoporteDe] = useState<Cuenta | null>(null)

  // Lo que sigue en cada cuenta va como botón; lo excepcional (bloquear, rechazar), en el menú.
  const siguiente = (estado: string) => (estado === 'APROBADA' ? 'PAGADA' : estado === 'PAGADA' || estado === 'RECHAZADA' ? null : 'APROBADA')

  return (
    <div>
      <h2 className="text-sm font-semibold">
        Cuentas de cobro
        {cuentas.length > 0 && <span className="ml-2 text-xs font-normal text-muted-foreground">{cuentas.length}</span>}
      </h2>
      {cuentas.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">Sin cuentas de cobro.</p>
      ) : (
        <ul className="divide-y">
          {cuentas.map((cc) => {
            const sig = siguiente(cc.estado)
            return (
              <li key={cc.id} className="space-y-2 py-3">
                <div className="flex items-center gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><Receipt className="size-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{cc.numero} · {cc.periodo}</p>
                    <p className="truncate text-xs text-muted-foreground">{fmtCOP(cc.valor)} · radicada {formatFechaCorta(new Date(cc.fechaRadicacion))}{cc.fechaPago ? ` · pagada ${formatFechaCorta(new Date(cc.fechaPago))}` : ''}</p>
                  </div>
                  <Pill tone={cc.estado === 'PAGADA' || cc.estado === 'APROBADA' ? 'ok' : cc.estado === 'BLOQUEADA_SS' || cc.estado === 'RECHAZADA' ? 'bad' : 'warn'}>{ESTADO_LABEL[cc.estado]}</Pill>
                </div>

                {/* Seguridad social: requisito para aprobar y pagar. */}
                <div className="flex flex-wrap items-center gap-2 pl-11">
                  {(cc.requierePila || cc.soporte) && <EstadoSS estado={cc.soporte?.estadoVerificacion} />}
                  <p className="min-w-[10rem] flex-1 truncate text-xs">
                    {cc.soporte
                      ? <>Seguridad social <b>{ESTADO_SS[cc.soporte.estadoVerificacion] ?? cc.soporte.estadoVerificacion}</b> · {cc.soporte.periodoCotizado}{cc.soporte.ibcDeclarado != null ? ` · IBC ${fmtCOP(cc.soporte.ibcDeclarado)}` : ''}</>
                      : cc.requierePila
                        ? <span className="text-amber-700 dark:text-amber-400">Sin soporte de seguridad social</span>
                        : <span className="text-muted-foreground">No se pidió planilla PILA</span>}
                  </p>
                  {/* Archivo de la planilla adjuntada por el contratista: se ve en la app. */}
                  {cc.planilla && (
                    <VisorPdf documentoId={cc.planilla.id} titulo={cc.planilla.nombre} mimeType={cc.planilla.esImagen ? 'image/*' : undefined} className="inline-flex size-8 items-center justify-center rounded-md border bg-background hover:bg-accent">
                      <Eye className="size-4" /><span className="sr-only">Ver planilla</span>
                    </VisorPdf>
                  )}
                  {/* Seguridad social y lo que sigue, en la misma línea si cabe (en el celular bajan). */}
                  <div className="ml-auto flex items-center gap-1.5">
                    {puedeEditar && (
                      <Button size="sm" variant="outline" onClick={() => setSoporteDe(cc)}>{cc.soporte ? 'Editar SS' : 'Registrar SS'}</Button>
                    )}
                    {puedeAprobar && sig && (
                      <>
                        <AccionEstado
                          id={cc.id} estado={sig} label={sig === 'PAGADA' ? 'Marcar pagada' : 'Aprobar'} icono={CircleCheck}
                          requiereFecha={sig === 'PAGADA'} onDone={() => router.refresh()}
                        />
                        <MenuEstado id={cc.id} bloqueada={cc.estado === 'BLOQUEADA_SS'} onDone={() => router.refresh()} />
                      </>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {soporteDe && <DialogSoporte cuenta={soporteDe} valorMensual={valorMensual} onClose={() => setSoporteDe(null)} onDone={() => { setSoporteDe(null); router.refresh() }} />}

    </div>
  )
}

function EstadoSS({ estado }: { estado?: string }) {
  if (estado === 'VALIDA') return <ShieldCheck className="size-5 text-emerald-600" />
  if (estado === 'INVALIDA') return <ShieldAlert className="size-5 text-destructive" />
  return <ShieldQuestionMark className="size-5 text-amber-500" />
}

/** Bloquear por seguridad social o rechazar: lo excepcional, en el menú de tres puntos. */
function MenuEstado({ id, bloqueada, onDone }: { id: string; bloqueada: boolean; onDone: () => void }) {
  const [cargando, setCargando] = useState(false)
  async function cambiar(estado: 'BLOQUEADA_SS' | 'RECHAZADA', label: string) {
    setCargando(true)
    const res = await cambiarEstadoCuenta({ id, estado })
    setCargando(false)
    if (res.ok) { toast.success(`Cuenta ${label}.`); onDone() } else toast.error(res.error)
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="outline" className="size-8" disabled={cargando} aria-label="Más acciones de la cuenta">
          {cargando ? <Spinner /> : <Ellipsis className="size-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {!bloqueada && <DropdownMenuItem onSelect={() => cambiar('BLOQUEADA_SS', 'bloqueada')}><Ban className="size-4" /> Bloquear (SS)</DropdownMenuItem>}
        <DropdownMenuItem variant="destructive" onSelect={() => cambiar('RECHAZADA', 'rechazada')}><CircleX className="size-4" /> Rechazar</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function AccionEstado({
  id, estado, label, icono: Icono, variant = 'default', requiereFecha, onDone,
}: {
  id: string; estado: string; label: string; icono: typeof CircleCheck
  variant?: 'default' | 'outline'; requiereFecha?: boolean; onDone: () => void
}) {
  const [cargando, setCargando] = useState(false)
  async function ejecutar() {
    setCargando(true)
    const fechaPago = requiereFecha ? new Date().toISOString().slice(0, 10) : undefined
    const res = await cambiarEstadoCuenta({ id, estado: estado as 'APROBADA', fechaPago })
    setCargando(false)
    if (res.ok) { toast.success(estado === 'PAGADA' ? 'Cuenta marcada como pagada.' : 'Cuenta aprobada.'); onDone() }
    else toast.error(res.error)
  }
  return (
    <Button size="sm" variant={variant} onClick={ejecutar} disabled={cargando}>
      {cargando ? <Spinner /> : <Icono className="size-4" />} {label}
    </Button>
  )
}

function DialogSoporte({
  cuenta, valorMensual, onClose, onDone,
}: { cuenta: Cuenta; valorMensual: number | null; onClose: () => void; onDone: () => void }) {
  const [operador, setOperador] = useState(cuenta.soporte?.operador ?? '')
  const [periodoCotizado, setPeriodoCotizado] = useState(cuenta.soporte?.periodoCotizado ?? cuenta.periodo)
  const [ibc, setIbc] = useState(cuenta.soporte?.ibcDeclarado?.toString() ?? '')
  const [estado, setEstado] = useState(cuenta.soporte?.estadoVerificacion ?? 'PENDIENTE')
  const [guardando, setGuardando] = useState(false)

  const minIbc = valorMensual ? valorMensual * 0.4 : null

  async function guardar() {
    setGuardando(true)
    const res = await registrarSoporteSs({
      cuentaCobroId: cuenta.id, operador, periodoCotizado,
      ibcDeclarado: ibc ? Number(ibc) : undefined,
      estadoVerificacion: estado as 'VALIDA',
    })
    setGuardando(false)
    if (res.ok) { toast.success('Soporte registrado.'); onDone() }
    else toast.error(res.error)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Verificación de seguridad social</DialogTitle>
          <DialogDescription>
            Requisito legal para pagar al contratista independiente.
            {minIbc && ` El IBC debe ser al menos ${fmtCOP(minIbc)} (40% del valor mensual).`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>Operador PILA</Label><Input value={operador} onChange={(e) => setOperador(e.target.value)} placeholder="Aportes en Línea, SOI…" /></div>
          <div className="space-y-1.5"><Label>Periodo cotizado (AAAA-MM)</Label><Input value={periodoCotizado} onChange={(e) => setPeriodoCotizado(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>IBC declarado</Label><Input type="number" value={ibc} onChange={(e) => setIbc(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>Resultado de la verificación</Label>
            <Select value={estado} onValueChange={setEstado}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDIENTE">Pendiente</SelectItem>
                <SelectItem value="VALIDA">Válida</SelectItem>
                <SelectItem value="INVALIDA">Inválida</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando}>{guardando && <Spinner />}Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
