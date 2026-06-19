'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ShieldCheck, ShieldAlert, ShieldQuestion, CheckCircle2, XCircle, Ban } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { fmtCOP } from '@/lib/moneda'
import { formatFechaCorta } from '@/lib/fechas'
import { registrarSoporteSs, cambiarEstadoCuenta } from '../../ops-acciones'

type Soporte = { estadoVerificacion: string; periodoCotizado: string; ibcDeclarado: number | null; operador: string | null }
type Cuenta = {
  id: string; numero: string; periodo: string; valor: number; estado: string
  fechaRadicacion: string; fechaPago: string | null; soporte: Soporte | null
}

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

  return (
    <div className="space-y-3">
      {cuentas.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center border rounded-lg border-dashed">
          Sin cuentas de cobro. Las radica el contratista desde su autoservicio; aquí las revisas, verificas la seguridad social y las apruebas o rechazas.
        </p>
      ) : (
        cuentas.map((cc) => (
          <Card key={cc.id}>
            <CardContent className="py-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="font-medium text-sm">{cc.numero} · Periodo {cc.periodo}</p>
                  <p className="text-xs text-muted-foreground">Radicada {formatFechaCorta(new Date(cc.fechaRadicacion))} · {fmtCOP(cc.valor)}</p>
                </div>
                <Badge variant={cc.estado === 'PAGADA' || cc.estado === 'APROBADA' ? 'default' : cc.estado === 'BLOQUEADA_SS' || cc.estado === 'RECHAZADA' ? 'destructive' : 'secondary'}>
                  {ESTADO_LABEL[cc.estado]}
                </Badge>
              </div>

              {/* Soporte SS */}
              <div className="flex items-center gap-2 rounded-lg border p-2.5">
                <EstadoSS estado={cc.soporte?.estadoVerificacion} />
                <div className="flex-1 text-xs">
                  {cc.soporte ? (
                    <>
                      <p>Seguridad social: <b>{cc.soporte.estadoVerificacion}</b> · periodo {cc.soporte.periodoCotizado}</p>
                      {cc.soporte.ibcDeclarado != null && <p className="text-muted-foreground">IBC: {fmtCOP(cc.soporte.ibcDeclarado)}</p>}
                    </>
                  ) : (
                    <p className="text-amber-600">Sin soporte de seguridad social. Requerido para aprobar/pagar.</p>
                  )}
                </div>
                {puedeEditar && (
                  <Button variant="outline" size="sm" onClick={() => setSoporteDe(cc)}>
                    {cc.soporte ? 'Editar SS' : 'Registrar SS'}
                  </Button>
                )}
              </div>

              {/* Acciones de estado */}
              {puedeAprobar && cc.estado !== 'PAGADA' && cc.estado !== 'RECHAZADA' && (
                <div className="flex flex-wrap gap-2">
                  <AccionEstado id={cc.id} estado="APROBADA" label="Aprobar" icono={CheckCircle2} onDone={() => router.refresh()} />
                  <AccionEstado id={cc.id} estado="PAGADA" label="Marcar pagada" icono={CheckCircle2} onDone={() => router.refresh()} requiereFecha />
                  <AccionEstado id={cc.id} estado="BLOQUEADA_SS" label="Bloquear (SS)" icono={Ban} variant="outline" onDone={() => router.refresh()} />
                  <AccionEstado id={cc.id} estado="RECHAZADA" label="Rechazar" icono={XCircle} variant="outline" onDone={() => router.refresh()} />
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}

      {soporteDe && <DialogSoporte cuenta={soporteDe} valorMensual={valorMensual} onClose={() => setSoporteDe(null)} onDone={() => { setSoporteDe(null); router.refresh() }} />}
    </div>
  )
}

function EstadoSS({ estado }: { estado?: string }) {
  if (estado === 'VALIDA') return <ShieldCheck className="size-5 text-emerald-600" />
  if (estado === 'INVALIDA') return <ShieldAlert className="size-5 text-destructive" />
  return <ShieldQuestion className="size-5 text-amber-500" />
}

function AccionEstado({
  id, estado, label, icono: Icono, variant = 'default', requiereFecha, onDone,
}: {
  id: string; estado: string; label: string; icono: typeof CheckCircle2
  variant?: 'default' | 'outline'; requiereFecha?: boolean; onDone: () => void
}) {
  const [cargando, setCargando] = useState(false)
  async function ejecutar() {
    setCargando(true)
    const fechaPago = requiereFecha ? new Date().toISOString().slice(0, 10) : undefined
    const res = await cambiarEstadoCuenta({ id, estado: estado as 'APROBADA', fechaPago })
    setCargando(false)
    if (res.ok) { toast.success(`Cuenta ${label.toLowerCase()}.`); onDone() }
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
