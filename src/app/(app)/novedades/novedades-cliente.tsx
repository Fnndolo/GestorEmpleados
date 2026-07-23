'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, CircleCheck, Paperclip, TreePalm, Stethoscope, File, Clock, CreditCard, type LucideIcon } from 'lucide-react'
import { Pill, type PillTone, type ChipColor } from '@/components/ui-kit'
import { ListaAcordeon } from '@/components/ui-kit/lista-acordeon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SelectorColaborador } from '@/components/colaboradores/selector-colaborador'
import { FiltroTabs } from '@/components/shell/filtro-tabs'
import { fmtCOP } from '@/lib/moneda'
import { formatFechaCorta } from '@/lib/fechas'
import {
  registrarVacaciones, registrarIncapacidad, registrarLicencia, registrarPermiso,
  registrarBonificacion, marcarBonificacionPagada,
} from './acciones'

const TABS = [
  { v: 'vacaciones', l: 'Vacaciones' }, { v: 'incapacidades', l: 'Incapacidades' },
  { v: 'licencias', l: 'Licencias' }, { v: 'permisos', l: 'Permisos' }, { v: 'bonificaciones', l: 'Bonificaciones' },
]

const TIPO_INCAP: Record<string, string> = {
  ENFERMEDAD_GENERAL: 'Enfermedad general', ACCIDENTE_TRABAJO: 'Accidente de trabajo',
  ENFERMEDAD_LABORAL: 'Enfermedad laboral', LICENCIA_MATERNIDAD: 'Lic. maternidad', LICENCIA_PATERNIDAD: 'Lic. paternidad',
}
const TIPO_LIC: Record<string, string> = {
  MATERNIDAD: 'Maternidad', PATERNIDAD: 'Paternidad', LUTO: 'Luto', CALAMIDAD: 'Calamidad', MATRIMONIO: 'Matrimonio',
  ESTUDIO: 'Estudio', NO_REMUNERADA: 'No remunerada', DIA_DE_LA_FAMILIA: 'Día de la familia',
  DIA_COMPENSATORIO_VOTACION: 'Día compensatorio (votación)', OTRA: 'Otra',
}
const ESTADO_VAC: Record<string, string> = {
  SOLICITADA: 'Solicitada', APROBADA: 'Aprobada', EN_DISFRUTE: 'En disfrute', DISFRUTADA: 'Disfrutada', RECHAZADA: 'Rechazada', CANCELADA: 'Cancelada',
}

/** El estado se lee de un vistazo por color — misma paleta que "Mi actividad" de autoservicio. */
const TONO_ESTADO: Record<string, PillTone> = {
  APROBADA: 'ok', DISFRUTADA: 'ok', PAGADO: 'ok',
  EN_DISFRUTE: 'info',
  SOLICITADA: 'warn', PENDIENTE: 'warn',
  RECHAZADA: 'bad',
  CANCELADA: 'muted',
}

type Datos = {
  vacaciones: { id: string; colaborador: string; colaboradorId: string; tieneFoto: boolean; fechaInicio: string; fechaFin: string; dias: number; estado: string; desdeAutoservicio: boolean; soporteDocId: string | null }[]
  incapacidades: { id: string; colaborador: string; colaboradorId: string; tieneFoto: boolean; tipo: string; fechaInicio: string; fechaFin: string; dias: number; desdeAutoservicio: boolean; soporteDocId: string | null }[]
  licencias: { id: string; colaborador: string; colaboradorId: string; tieneFoto: boolean; tipo: string; fechaInicio: string; fechaFin: string; dias: number; remunerada: boolean }[]
  permisos: { id: string; colaborador: string; colaboradorId: string; tieneFoto: boolean; fecha: string; diaCompleto: boolean; horas: number | null; motivo: string; desdeAutoservicio: boolean; soporteDocId: string | null }[]
  bonificaciones: { id: string; colaborador: string; colaboradorId: string; tieneFoto: boolean; concepto: string; valor: number; constitutivoSalario: boolean; estadoPago: string; fechaPago: string | null }[]
}

/** Ícono y color por tipo de novedad — mismo lenguaje visual que "Mi actividad" de autoservicio. */
const CHIP_NOV: Record<string, { icono: LucideIcon; color: ChipColor }> = {
  vacaciones: { icono: TreePalm, color: 'emerald' },
  incapacidades: { icono: Stethoscope, color: 'rose' },
  licencias: { icono: File, color: 'violet' },
  permisos: { icono: Clock, color: 'sky' },
  bonificaciones: { icono: CreditCard, color: 'ink' },
}

/** Insignia de origen autoservicio + enlace al soporte adjunto por el empleado. */
function OrigenSoporte({ autoservicio, docId }: { autoservicio: boolean; docId: string | null }) {
  if (!autoservicio && !docId) return null
  return (
    <div className="flex items-center gap-2 shrink-0">
      {autoservicio && <Badge variant="outline" className="text-[10px]">Autoservicio</Badge>}
      {docId && (
        <a href={`/api/documentos/${docId}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
          <Paperclip className="size-3.5" /> Soporte
        </a>
      )}
    </div>
  )
}

export function NovedadesCliente({ tab, datos, puedeCrear, puedeEditar }: { tab: string; datos: Datos; puedeCrear: boolean; puedeEditar: boolean }) {
  const [dialogo, setDialogo] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <FiltroTabs tabs={TABS.map((t) => ({ valor: t.v, label: t.l }))} activo={tab} basePath="/novedades" />
        </div>
        {puedeCrear && <Button size="sm" onClick={() => setDialogo(tab)}><Plus className="size-4" /> Registrar</Button>}
      </div>

      {tab === 'vacaciones' && (
        <Lista
          chip={CHIP_NOV.vacaciones}
          items={datos.vacaciones.map((x) => ({
            id: x.id,
            titulo: x.colaborador,
            avatar: { colaboradorId: x.colaboradorId, tieneFoto: x.tieneFoto, nombre: x.colaborador },
            sub: `${formatFechaCorta(new Date(x.fechaInicio))} a ${formatFechaCorta(new Date(x.fechaFin))} · ${x.dias} días hábiles`,
            campos: [
              { label: 'Desde', valor: formatFechaCorta(new Date(x.fechaInicio)) },
              { label: 'Hasta', valor: formatFechaCorta(new Date(x.fechaFin)) },
              { label: 'Días hábiles', valor: String(x.dias) },
              { label: 'Estado', valor: ESTADO_VAC[x.estado] ?? x.estado },
              { label: 'Origen', valor: x.desdeAutoservicio ? 'Autoservicio' : 'Registro de RRHH' },
            ],
            derecha: (
              <div className="flex shrink-0 items-center gap-2">
                <OrigenSoporte autoservicio={x.desdeAutoservicio} docId={x.soporteDocId} />
                <Pill tone={TONO_ESTADO[x.estado] ?? 'muted'}>{ESTADO_VAC[x.estado]}</Pill>
              </div>
            ),
          }))}
        />
      )}
      {tab === 'incapacidades' && (
        <Lista
          chip={CHIP_NOV.incapacidades}
          items={datos.incapacidades.map((x) => ({
            id: x.id,
            titulo: x.colaborador,
            avatar: { colaboradorId: x.colaboradorId, tieneFoto: x.tieneFoto, nombre: x.colaborador },
            sub: `${TIPO_INCAP[x.tipo]} · ${formatFechaCorta(new Date(x.fechaInicio))} a ${formatFechaCorta(new Date(x.fechaFin))} · ${x.dias} días`,
            campos: [
              { label: 'Tipo', valor: TIPO_INCAP[x.tipo] ?? x.tipo },
              { label: 'Desde', valor: formatFechaCorta(new Date(x.fechaInicio)) },
              { label: 'Hasta', valor: formatFechaCorta(new Date(x.fechaFin)) },
              { label: 'Días', valor: String(x.dias) },
              { label: 'Origen', valor: x.desdeAutoservicio ? 'Autoservicio' : 'Registro de RRHH' },
            ],
            derecha: <OrigenSoporte autoservicio={x.desdeAutoservicio} docId={x.soporteDocId} />,
          }))}
        />
      )}
      {tab === 'licencias' && (
        <Lista
          chip={CHIP_NOV.licencias}
          items={datos.licencias.map((x) => ({
            id: x.id,
            titulo: x.colaborador,
            avatar: { colaboradorId: x.colaboradorId, tieneFoto: x.tieneFoto, nombre: x.colaborador },
            sub: `${TIPO_LIC[x.tipo]} · ${x.dias} días · ${x.remunerada ? 'Remunerada' : 'No remunerada'}`,
            campos: [
              { label: 'Tipo', valor: TIPO_LIC[x.tipo] ?? x.tipo },
              { label: 'Desde', valor: formatFechaCorta(new Date(x.fechaInicio)) },
              { label: 'Hasta', valor: formatFechaCorta(new Date(x.fechaFin)) },
              { label: 'Días', valor: String(x.dias) },
              { label: 'Remunerada', valor: x.remunerada ? 'Sí' : 'No' },
            ],
          }))}
        />
      )}
      {tab === 'permisos' && (
        <Lista
          chip={CHIP_NOV.permisos}
          items={datos.permisos.map((x) => ({
            id: x.id,
            titulo: x.colaborador,
            avatar: { colaboradorId: x.colaboradorId, tieneFoto: x.tieneFoto, nombre: x.colaborador },
            sub: `${formatFechaCorta(new Date(x.fecha))} · ${x.diaCompleto ? 'Día completo' : `${x.horas ?? 0} horas`} · ${x.motivo}`,
            campos: [
              { label: 'Fecha', valor: formatFechaCorta(new Date(x.fecha)) },
              { label: 'Modalidad', valor: x.diaCompleto ? 'Día completo' : `Por horas (${x.horas ?? 0})` },
              ...(x.motivo ? [{ label: 'Motivo', valor: x.motivo }] : []),
              { label: 'Origen', valor: x.desdeAutoservicio ? 'Autoservicio' : 'Registro de RRHH' },
            ],
            derecha: <OrigenSoporte autoservicio={x.desdeAutoservicio} docId={x.soporteDocId} />,
          }))}
        />
      )}
      {tab === 'bonificaciones' && <ListaBonificaciones items={datos.bonificaciones} puedeEditar={puedeEditar} />}

      {dialogo && <DialogRegistro tab={dialogo} onClose={() => setDialogo(null)} />}
    </div>
  )
}

/** ListaAcordeon del kit con estado vacío de la pestaña. */
function Lista(props: React.ComponentProps<typeof ListaAcordeon>) {
  if (props.items.length === 0) return <Vacio />
  return <ListaAcordeon {...props} />
}

function ListaBonificaciones({ items, puedeEditar }: { items: Datos['bonificaciones']; puedeEditar: boolean }) {
  const router = useRouter()
  return (
    <Lista
      chip={CHIP_NOV.bonificaciones}
      items={items.map((x) => ({
        id: x.id,
        titulo: x.colaborador,
        avatar: { colaboradorId: x.colaboradorId, tieneFoto: x.tieneFoto, nombre: x.colaborador },
        sub: `${x.concepto} · ${fmtCOP(x.valor)} · ${x.constitutivoSalario ? 'Constitutivo' : 'No constitutivo'}`,
        campos: [
          { label: 'Concepto', valor: x.concepto },
          { label: 'Valor', valor: fmtCOP(x.valor) },
          { label: 'Constitutivo de salario', valor: x.constitutivoSalario ? 'Sí' : 'No' },
          { label: 'Estado de pago', valor: x.estadoPago === 'PAGADO' ? 'Pagado' : 'Pendiente' },
          ...(x.fechaPago ? [{ label: 'Fecha de pago', valor: formatFechaCorta(new Date(x.fechaPago)) }] : []),
        ],
        derecha: x.estadoPago === 'PAGADO' ? (
          <Pill tone="ok">Pagado {x.fechaPago ? formatFechaCorta(new Date(x.fechaPago)) : ''}</Pill>
        ) : puedeEditar ? (
          <Button size="sm" variant="outline" onClick={async () => {
            const res = await marcarBonificacionPagada({ id: x.id })
            if (res.ok) { toast.success('Marcada como pagada.'); router.refresh() } else toast.error(res.error)
          }}><CircleCheck className="size-4" /> Marcar pagada</Button>
        ) : <Pill tone="warn">Pendiente</Pill>,
      }))}
    />
  )
}

function Vacio() {
  return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Sin registros en esta categoría.</CardContent></Card>
}

function DialogRegistro({ tab, onClose }: { tab: string; onClose: () => void }) {
  const router = useRouter()
  const [colaboradorId, setColaboradorId] = useState('')
  const [g, setG] = useState(false)
  const [campos, setCampos] = useState<Record<string, string | boolean>>({
    tipo: tab === 'incapacidades' ? 'ENFERMEDAD_GENERAL' : tab === 'licencias' ? 'NO_REMUNERADA' : '',
    remunerada: true, remunerado: true, diaCompleto: true, constitutivoSalario: false, esProrroga: false,
  })
  const set = (k: string, v: string | boolean) => setCampos((p) => ({ ...p, [k]: v }))

  async function guardar() {
    if (!colaboradorId) { toast.error('Selecciona un colaborador.'); return }
    setG(true)
    let res
    if (tab === 'vacaciones') res = await registrarVacaciones({ colaboradorId, fechaInicio: campos.fechaInicio as string, fechaFin: campos.fechaFin as string, observaciones: campos.observaciones as string })
    else if (tab === 'incapacidades') res = await registrarIncapacidad({ colaboradorId, tipo: campos.tipo as 'ENFERMEDAD_GENERAL', fechaInicio: campos.fechaInicio as string, fechaFin: campos.fechaFin as string, diagnosticoCie10: campos.diagnosticoCie10 as string, entidad: campos.entidad as string, esProrroga: campos.esProrroga as boolean, observaciones: campos.observaciones as string })
    else if (tab === 'licencias') res = await registrarLicencia({ colaboradorId, tipo: campos.tipo as 'NO_REMUNERADA', fechaInicio: campos.fechaInicio as string, fechaFin: campos.fechaFin as string, remunerada: campos.remunerada as boolean, observaciones: campos.observaciones as string })
    else if (tab === 'permisos') res = await registrarPermiso({ colaboradorId, fecha: campos.fecha as string, diaCompleto: campos.diaCompleto as boolean, horas: campos.horas ? Number(campos.horas) : undefined, motivo: campos.motivo as string, remunerado: campos.remunerado as boolean })
    else res = await registrarBonificacion({ colaboradorId, concepto: campos.concepto as string, valor: Number(campos.valor || 0), constitutivoSalario: campos.constitutivoSalario as boolean, observaciones: campos.observaciones as string })
    setG(false)
    if (res?.ok) { toast.success('Novedad registrada.'); onClose(); router.refresh() } else toast.error(res?.error ?? 'Error')
  }

  const titulos: Record<string, string> = { vacaciones: 'Registrar vacaciones', incapacidades: 'Registrar incapacidad', licencias: 'Registrar licencia', permisos: 'Registrar permiso', bonificaciones: 'Registrar bonificación' }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{titulos[tab]}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>Colaborador</Label><SelectorColaborador value={colaboradorId} onChange={(id) => setColaboradorId(id)} /></div>

          {tab === 'incapacidades' && (
            <Sel label="Tipo" value={campos.tipo as string} onChange={(v) => set('tipo', v)} opciones={Object.entries(TIPO_INCAP)} />
          )}
          {tab === 'licencias' && (
            <Sel label="Tipo" value={campos.tipo as string} onChange={(v) => set('tipo', v)} opciones={Object.entries(TIPO_LIC)} />
          )}

          {(tab === 'vacaciones' || tab === 'incapacidades' || tab === 'licencias') && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Fecha inicio">
                  <Input type="date" min={tab === 'vacaciones' ? minInicioVacaciones() : undefined} onChange={(e) => set('fechaInicio', e.target.value)} />
                </Campo>
                <Campo label="Fecha fin"><Input type="date" onChange={(e) => set('fechaFin', e.target.value)} /></Campo>
              </div>
              {tab === 'vacaciones' && (
                <p className="text-xs text-muted-foreground">
                  La empresa debe notificar las vacaciones con al menos 15 días de anticipación (RIT art. 34).
                </p>
              )}
            </>
          )}
          {tab === 'permisos' && (
            <>
              <Campo label="Fecha"><Input type="date" onChange={(e) => set('fecha', e.target.value)} /></Campo>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={campos.diaCompleto as boolean} onCheckedChange={(v) => set('diaCompleto', Boolean(v))} /> Día completo</label>
              {!campos.diaCompleto && <Campo label="Horas"><Input type="number" step="0.5" onChange={(e) => set('horas', e.target.value)} /></Campo>}
              <Campo label="Motivo"><Textarea rows={2} onChange={(e) => set('motivo', e.target.value)} /></Campo>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={campos.remunerado as boolean} onCheckedChange={(v) => set('remunerado', Boolean(v))} /> Remunerado</label>
            </>
          )}
          {tab === 'incapacidades' && (
            <>
              <Campo label="Diagnóstico CIE-10 (opcional)"><Input onChange={(e) => set('diagnosticoCie10', e.target.value)} /></Campo>
              <Campo label="Entidad (EPS/ARL)"><Input onChange={(e) => set('entidad', e.target.value)} /></Campo>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={campos.esProrroga as boolean} onCheckedChange={(v) => set('esProrroga', Boolean(v))} /> Es prórroga</label>
            </>
          )}
          {tab === 'licencias' && (
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={campos.remunerada as boolean} onCheckedChange={(v) => set('remunerada', Boolean(v))} /> Remunerada</label>
          )}
          {tab === 'bonificaciones' && (
            <>
              <Campo label="Concepto"><Input onChange={(e) => set('concepto', e.target.value)} /></Campo>
              <Campo label="Valor"><Input type="number" onChange={(e) => set('valor', e.target.value)} /></Campo>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={campos.constitutivoSalario as boolean} onCheckedChange={(v) => set('constitutivoSalario', Boolean(v))} /> Constitutivo de salario</label>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={g}>{g && <Spinner />}Registrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Mínimo para iniciar vacaciones registradas por la empresa: hoy + 15 días (RIT art. 34). */
function minInicioVacaciones(): string {
  const d = new Date()
  d.setDate(d.getDate() + 15)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>
}
function Sel({ label, value, onChange, opciones }: { label: string; value: string; onChange: (v: string) => void; opciones: [string, string][] }) {
  return (
    <Campo label={label}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>{opciones.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
      </Select>
    </Campo>
  )
}
