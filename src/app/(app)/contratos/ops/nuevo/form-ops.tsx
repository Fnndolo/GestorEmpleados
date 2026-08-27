'use client'

import { useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { z } from 'zod'
import { toast } from 'sonner'
import { Save, Plus, Trash2, ChevronDown, ChevronRight, ArrowUp, ArrowDown, GripVertical, User, Coins, ListChecks, FileText, Building2, Sparkles, Lock } from 'lucide-react'
import { renumerarTitulo } from '@/lib/ordinales'
import { contratoOpsSchema, type ContratoOpsInput } from '@/lib/validaciones/contrato'
import { crearContratoOps, datosContratistaOps } from '../../ops-acciones'
import { SelectorColaborador } from '@/components/colaboradores/selector-colaborador'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PreviewContrato } from './preview-contrato'
import { EditorFunciones } from '@/components/contratos/editor-funciones'
import { Seccion, type EstadoSeccion } from '@/components/contratos/seccion-acordeon'
import type { DatosContrato, FuncionesCargo, ClausulaPlantilla } from '@/lib/contrato-variables'

type OpsFormValues = z.input<typeof contratoOpsSchema>
type Cargo = { id: string; nombre: string; funciones: FuncionesCargo | null }
type Empresa = { razonSocial: string; marca: string; nit: string; representanteLegal: string; representanteLegalCc: string; direccion: string; correoDevolucion: string }
type Plantilla = { titulo: string; intro: string; cierre: string; clausulas: ClausulaPlantilla[] } | null
type ClausulaEdit = { key: number; titulo: string; cuerpo: string; esFunciones: boolean }
type EntregableEdit = { key: number; descripcion: string; fechaEntrega: string }

/** Fecha fin = inicio + `meses` − 1 día (los "6 meses desde el 15-ene" terminan el 14-jul). */
function finDesde(inicioIso: string, meses: number): string {
  const [y, m, d] = inicioIso.split('-').map(Number)
  const total = m - 1 + meses
  const ty = y + Math.floor(total / 12)
  const tm = total % 12
  const diasMes = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate() // clamp: 31-ene + 1 mes → 28-feb
  const f = new Date(Date.UTC(ty, tm, Math.min(d, diasMes)))
  f.setUTCDate(f.getUTCDate() - 1)
  return f.toISOString().slice(0, 10)
}

function SubSeccion({ titulo, open, onToggle, extra, children }: { titulo: string; open: boolean; onToggle: () => void; extra?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-md border">
      <div className="flex items-center gap-1 px-3 py-2">
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm font-medium">
          {open ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
          <span className="truncate">{titulo}</span>
        </button>
        {extra}
      </div>
      {open && <div className="space-y-3 border-t p-3">{children}</div>}
    </div>
  )
}

export function ContratoOpsSplit({
  sedes,
  cargos,
  empresa,
  plantilla,
}: {
  sedes: { id: string; nombre: string; ciudad: string }[]
  cargos: Cargo[]
  empresa: Empresa
  plantilla: Plantilla
}) {
  const router = useRouter()
  const [guardando, setGuardando] = useState(false)
  const [nombreSup, setNombreSup] = useState('')

  const keyRef = useRef(0)
  const nuevaKey = () => ++keyRef.current
  const [clausulas, setClausulas] = useState<ClausulaEdit[]>(
    () => (plantilla?.clausulas ?? []).map((c) => ({ key: nuevaKey(), titulo: c.titulo, cuerpo: c.cuerpo, esFunciones: c.esFunciones })),
  )
  const [abiertas, setAbiertas] = useState<Set<number>>(new Set())
  const [funciones, setFunciones] = useState<FuncionesCargo>([])
  const [entregables, setEntregables] = useState<EntregableEdit[]>([])
  // Drag & drop de cláusulas: solo se activa desde el handle (⠿).
  const [dragKey, setDragKey] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  // Fechas derivadas: dejar de calcular en cuanto el usuario las edite a mano.
  const inicioManual = useRef(false)
  const finManual = useRef(false)
  const [secOpen, setSecOpen] = useState<Set<string>>(new Set())
  const toggleSec = (id: string) => setSecOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  // Paneles de nivel superior (acordeón). Solo "condiciones" abierto de entrada:
  // lo demás viene prellenado y se abre solo si se quiere revisar.
  const [panel, setPanel] = useState<Set<string>>(new Set(['condiciones']))
  const togglePanel = (id: string) => setPanel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const { register, handleSubmit, setValue, getValues, watch, formState: { errors } } = useForm<OpsFormValues, unknown, ContratoOpsInput>({
    resolver: zodResolver(contratoOpsSchema),
    defaultValues: {
      colaboradorId: '', numero: '', valorTotal: 0, valorMensual: 0, supervisorId: '', cargoId: '', cargoObjeto: '', sedeId: '',
      fechaInicio: '', fechaFin: '', fechaSuscripcion: '', ciudad: '', plazoMeses: 0, rut: '',
      contratistaNombre: '', contratistaCc: '', contratistaCcLugar: '', contratistaDireccion: '', contratistaEmail: '', contratistaTelefono: '', contratistaGenero: '',
      empresaRazonSocial: empresa.razonSocial, empresaMarca: empresa.marca, empresaNit: empresa.nit,
      empresaRepLegal: empresa.representanteLegal, empresaRepLegalCc: empresa.representanteLegalCc, empresaCorreoDevolucion: empresa.correoDevolucion,
      plantillaTitulo: plantilla?.titulo ?? 'CONTRATO DE PRESTACIÓN DE SERVICIOS',
      plantillaIntro: plantilla?.intro ?? '',
      plantillaCierre: plantilla?.cierre ?? '',
      generarPdf: true,
    },
  })

  const w = watch()

  // ── estado de cada sección para las píldoras del acordeón ──
  const contratistaListo = Boolean(w.colaboradorId)
  const estadoContratista: EstadoSeccion = contratistaListo
    ? { tono: 'muted', texto: 'Autocompletado', auto: true }
    : { tono: 'muted', texto: 'Datos manuales' }
  const faltaCondiciones = !w.sedeId ? 'Falta la sede'
    : !Number(w.valorTotal) ? 'Falta el valor'
    : !w.fechaInicio ? 'Falta la fecha de inicio'
    : null
  const estadoCondiciones: EstadoSeccion = faltaCondiciones
    ? { tono: 'warn', texto: faltaCondiciones }
    : { tono: 'ok', texto: 'Completo' }
  const entregablesValidos = entregables.filter((e) => e.descripcion.trim().length >= 3).length
  const estadoEntregables: EstadoSeccion = { tono: 'muted', texto: entregablesValidos > 0 ? `${entregablesValidos}` : 'Ninguno' }
  const estadoDocumento: EstadoSeccion = { tono: 'muted', texto: 'Desde la plantilla', auto: true }
  const estadoEmpresa: EstadoSeccion = { tono: 'muted', texto: 'Desde Configuración', auto: true }

  const datos: DatosContrato = {
    empresa: {
      razonSocial: w.empresaRazonSocial ?? '', marca: w.empresaMarca ?? '', nit: w.empresaNit ?? '',
      representanteLegal: w.empresaRepLegal ?? '', representanteLegalCc: w.empresaRepLegalCc ?? null,
      direccion: empresa.direccion, correoDevolucion: w.empresaCorreoDevolucion ?? null,
    },
    contratista: {
      nombre: w.contratistaNombre, cc: w.contratistaCc, ccLugar: w.contratistaCcLugar,
      direccion: w.contratistaDireccion, email: w.contratistaEmail, telefono: w.contratistaTelefono,
      genero: w.contratistaGenero,
    },
    contrato: {
      numero: w.numero || null, ciudad: w.ciudad, fechaSuscripcion: w.fechaSuscripcion || null,
      fechaInicio: w.fechaInicio || null, fechaFin: w.fechaFin || null,
      plazoMeses: w.plazoMeses ? Number(w.plazoMeses) : null,
      valorTotal: w.valorTotal ? Number(w.valorTotal) : null,
      honorarioMensual: w.valorMensual ? Number(w.valorMensual) : null,
      cargoObjeto: w.cargoObjeto || null,
    },
  }

  const plantillaPreview = {
    titulo: w.plantillaTitulo ?? '',
    intro: w.plantillaIntro ?? '',
    cierre: w.plantillaCierre ?? '',
    clausulas: clausulas.map((c, i) => ({ titulo: c.titulo, cuerpo: c.cuerpo, esFunciones: c.esFunciones, orden: i + 1 })),
  }

  // ── fechas derivadas ──
  function recalcularFin() {
    if (finManual.current) return
    const inicio = getValues('fechaInicio')
    const meses = Number(getValues('plazoMeses') || 0)
    if (inicio && meses > 0) setValue('fechaFin', finDesde(inicio, meses))
  }
  function onSuscripcion() {
    const s = getValues('fechaSuscripcion')
    if (s && !inicioManual.current) {
      setValue('fechaInicio', s)
      recalcularFin()
    }
  }

  function aplicarCargo(cargoId: string) {
    setValue('cargoId', cargoId)
    const cargo = cargos.find((c) => c.id === cargoId)
    if (cargo) {
      setValue('cargoObjeto', cargo.nombre)
      setFunciones(cargo.funciones ?? [])
    }
  }

  async function onSelectContratista(id: string) {
    setValue('colaboradorId', id)
    const res = await datosContratistaOps({ colaboradorId: id })
    if (res.ok) {
      const d = res.datos as { nombre: string; cc: string; ccLugar: string; direccion: string; email: string; telefono: string; genero: string; cargoId: string; ciudad: string; sedeId: string }
      setValue('contratistaGenero', d.genero)
      setValue('contratistaNombre', d.nombre)
      setValue('contratistaCc', d.cc)
      setValue('contratistaCcLugar', d.ccLugar)
      setValue('contratistaDireccion', d.direccion)
      setValue('contratistaEmail', d.email)
      setValue('contratistaTelefono', d.telefono)
      if (d.ciudad) setValue('ciudad', d.ciudad)
      if (d.sedeId) setValue('sedeId', d.sedeId)
      if (d.cargoId && cargos.some((c) => c.id === d.cargoId)) aplicarCargo(d.cargoId)
    } else {
      toast.error(res.error)
    }
  }

  // ── edición de cláusulas ──
  function toggle(key: number) {
    setAbiertas((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n })
  }
  function editar(key: number, campo: 'titulo' | 'cuerpo', valor: string) {
    setClausulas((cs) => cs.map((c) => (c.key === key ? { ...c, [campo]: valor } : c)))
  }
  /** Reescribe el ordinal del título de cada cláusula según su posición (1 → PRIMERA…). */
  function renumerar(cs: ClausulaEdit[]): ClausulaEdit[] {
    return cs.map((c, i) => ({ ...c, titulo: renumerarTitulo(c.titulo, i + 1) }))
  }
  function eliminar(key: number) {
    setClausulas((cs) => renumerar(cs.filter((c) => c.key !== key)))
  }
  function mover(i: number, dir: -1 | 1) {
    setClausulas((cs) => {
      const j = i + dir
      if (j < 0 || j >= cs.length) return cs
      const n = [...cs]; [n[i], n[j]] = [n[j], n[i]]; return renumerar(n)
    })
  }
  /** Suelta la cláusula arrastrada (dragKey) en la posición de destKey. */
  function soltar(destKey: number) {
    setClausulas((cs) => {
      if (dragKey == null || dragKey === destKey) return cs
      const desde = cs.findIndex((c) => c.key === dragKey)
      const hasta = cs.findIndex((c) => c.key === destKey)
      if (desde < 0 || hasta < 0) return cs
      const n = [...cs]
      const [movida] = n.splice(desde, 1)
      n.splice(hasta, 0, movida)
      return renumerar(n)
    })
    setDragKey(null)
    setDragOver(null)
  }
  function agregar() {
    const key = nuevaKey()
    setClausulas((cs) => [...cs, { key, titulo: 'NUEVA CLÁUSULA:', cuerpo: '', esFunciones: false }])
    setAbiertas((s) => new Set(s).add(key))
    setSecOpen((s) => new Set(s).add('clausulas'))
  }

  async function onSubmit(d: ContratoOpsInput) {
    setGuardando(true)
    const payload = {
      ...d,
      clausulas: clausulas.map(({ titulo, cuerpo, esFunciones }) => ({ titulo, cuerpo, esFunciones })),
      funciones,
      entregables: entregables
        .filter((e) => e.descripcion.trim().length >= 3)
        .map(({ descripcion, fechaEntrega }) => ({ descripcion, fechaEntrega })),
    }
    const res = await crearContratoOps(payload)
    setGuardando(false)
    if (res.ok) {
      toast.success('Contrato OPS creado y documento generado.')
      router.push(`/contratos/ops/${(res.datos as { id: string }).id}`)
      router.refresh()
    } else toast.error(res.error)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Panel de edición (izquierda) */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-2.5">
        {/* ── Contratista: prellenado al elegir el colaborador ── */}
        <Seccion
          icono={User} color="violet" titulo="Contratista"
          resumen={w.contratistaNombre ? `${w.contratistaNombre}${w.contratistaCc ? ` · ${w.contratistaCc}` : ''}` : 'Opcional: autocompleta los datos desde una ficha'}
          estado={estadoContratista} prellenada={contratistaListo}
          open={panel.has('contratista')} onToggle={() => togglePanel('contratista')}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Buscar colaborador (opcional)</Label>
              <SelectorColaborador value={w.colaboradorId ?? ''} onChange={onSelectContratista} placeholder="Selecciona para autocompletar…" />
              {errors.colaboradorId && <p className="text-xs text-destructive">{errors.colaboradorId.message}</p>}
            </div>
            <div className="space-y-1.5"><Label>Nombre</Label><Input spellCheck lang="es" {...register('contratistaNombre')} /></div>
            <div className="space-y-1.5"><Label>Identificación</Label><Input {...register('contratistaCc')} /></div>
            <div className="space-y-1.5"><Label>Lugar de expedición</Label><Input spellCheck lang="es" {...register('contratistaCcLugar')} /></div>
            <div className="space-y-1.5"><Label>Teléfono / WhatsApp</Label><Input {...register('contratistaTelefono')} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Dirección</Label><Input spellCheck lang="es" {...register('contratistaDireccion')} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Correo electrónico</Label><Input {...register('contratistaEmail')} /></div>
          </div>
        </Seccion>

        {/* ── Cargo, condiciones y plazo: LO QUE SE DIGITA (abierto de entrada) ── */}
        <Seccion
          icono={Coins} color="emerald" titulo="Cargo, condiciones y plazo"
          resumen="Los datos propios de este contrato"
          estado={estadoCondiciones}
          open={panel.has('condiciones')} onToggle={() => togglePanel('condiciones')}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {contratistaListo && (
              <div className="sm:col-span-2 flex items-center gap-2 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                <Sparkles className="size-3.5 shrink-0" /> Cargo, ciudad y sede se tomaron del colaborador. Ajústalos si este contrato es distinto.
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Cargo</Label>
              <Select value={w.cargoId ?? ''} onValueChange={aplicarCargo}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                <SelectContent>{cargos.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {/* Este campo define el objeto: alimenta {{cargo_objeto}} en la cláusula
                de OBJETO, y de él se deriva el resumen que se ve en los listados. */}
            <div className="space-y-1.5"><Label>Rol en el contrato</Label><Input spellCheck lang="es" {...register('cargoObjeto')} placeholder="p. ej. operador de call center" /><p className="text-[11px] text-muted-foreground">Es el encargo que redacta la cláusula de objeto.</p></div>
            <div className="space-y-1.5"><Label>Valor total</Label><Input type="number" {...register('valorTotal')} />{errors.valorTotal && <p className="text-xs text-destructive">{errors.valorTotal.message}</p>}</div>
            <div className="space-y-1.5"><Label>Honorario mensual</Label><Input type="number" {...register('valorMensual')} /></div>
            <div className="space-y-1.5"><Label>Plazo (meses)</Label><Input type="number" {...register('plazoMeses', { onChange: recalcularFin })} /></div>
            <div className="space-y-1.5"><Label>Ciudad</Label><Input spellCheck lang="es" {...register('ciudad')} /></div>
            <div className="space-y-1.5"><Label>Fecha de suscripción</Label><Input type="date" {...register('fechaSuscripcion', { onChange: onSuscripcion })} /><p className="text-[11px] text-muted-foreground">Rellena la fecha de inicio automáticamente.</p></div>
            <div className="space-y-1.5">
              <Label>Sede</Label>
              <Select value={w.sedeId} onValueChange={(v) => setValue('sedeId', v)}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                <SelectContent>{sedes.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre} · {s.ciudad}</SelectItem>)}</SelectContent>
              </Select>
              {errors.sedeId && <p className="text-xs text-destructive">{errors.sedeId.message}</p>}
            </div>
            <div className="space-y-1.5"><Label>Fecha de inicio</Label><Input type="date" {...register('fechaInicio', { onChange: () => { inicioManual.current = true; recalcularFin() } })} />{errors.fechaInicio && <p className="text-xs text-destructive">{errors.fechaInicio.message}</p>}</div>
            <div className="space-y-1.5"><Label>Fecha de fin</Label><Input type="date" {...register('fechaFin', { onChange: () => { finManual.current = true } })} /><p className="text-[11px] text-muted-foreground">Se calcula con inicio + plazo; edítala si necesitas otra.</p>{errors.fechaFin && <p className="text-xs text-destructive">{errors.fechaFin.message}</p>}</div>
            <div className="space-y-1.5"><Label>RUT (opcional)</Label><Input {...register('rut')} /></div>
            <div className="space-y-1.5">
              <Label>Supervisor (opcional)</Label>
              <SelectorColaborador value={w.supervisorId ?? ''} onChange={(id, n) => { setValue('supervisorId', id); setNombreSup(n) }} placeholder="Selecciona…" />
              {nombreSup && <p className="text-xs text-muted-foreground">{nombreSup}</p>}
            </div>
          </div>
        </Seccion>

        {/* ── Entregables (opcional) ── */}
        <Seccion
          icono={ListChecks} color="teal" titulo="Entregables"
          resumen="Opcional · el supervisor los verifica antes de pagar"
          estado={estadoEntregables}
          open={panel.has('entregables')} onToggle={() => togglePanel('entregables')}
        >
          <div className="space-y-2">
            <div className="flex justify-end">
              <Button type="button" size="sm" variant="outline" onClick={() => setEntregables((es) => [...es, { key: nuevaKey(), descripcion: '', fechaEntrega: '' }])}>
                <Plus className="size-4" /> Añadir
              </Button>
            </div>
            {entregables.length === 0 && (
              <p className="text-sm text-muted-foreground">Lista lo que el contratista debe entregar (p. ej. informe mensual de actividades); el supervisor marcará su cumplimiento antes de aprobar los pagos.</p>
            )}
            {entregables.map((e) => (
              <div key={e.key} className="flex items-start gap-2">
                <Input
                  value={e.descripcion}
                  onChange={(ev) => setEntregables((es) => es.map((x) => (x.key === e.key ? { ...x, descripcion: ev.target.value } : x)))}
                  placeholder="Descripción del entregable"
                  spellCheck lang="es"
                  className="flex-1"
                />
                <Input
                  type="date"
                  value={e.fechaEntrega}
                  onChange={(ev) => setEntregables((es) => es.map((x) => (x.key === e.key ? { ...x, fechaEntrega: ev.target.value } : x)))}
                  className="w-40 shrink-0"
                />
                <Button type="button" size="icon" variant="ghost" className="size-9 shrink-0 text-destructive" onClick={() => setEntregables((es) => es.filter((x) => x.key !== e.key))}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        </Seccion>

        {/* ── Documento del contrato: prellenado desde la plantilla ── */}
        <Seccion
          icono={FileText} color="sky" titulo="Documento del contrato"
          resumen={`Título, ${clausulas.length} cláusula${clausulas.length === 1 ? '' : 's'}, funciones y cierre`}
          estado={estadoDocumento} prellenada
          open={panel.has('documento')} onToggle={() => togglePanel('documento')}
        >
          <div className="space-y-2">
            <SubSeccion titulo="Encabezado (título, número e introducción)" open={secOpen.has('encabezado')} onToggle={() => toggleSec('encabezado')}>
              <div className="space-y-1.5"><Label>Título</Label><Input spellCheck lang="es" {...register('plantillaTitulo')} /></div>
              <div className="space-y-1.5"><Label>Número del contrato</Label><Input {...register('numero')} placeholder="Se asigna automático si lo dejas vacío (p. ej. KC-001)" /></div>
              <div className="space-y-1.5"><Label>Párrafo introductorio</Label><Textarea rows={5} spellCheck lang="es" {...register('plantillaIntro')} className="text-xs" /><p className="text-xs text-muted-foreground">Variables: <code>{'{{contratista_nombre}}'}</code>, <code>{'{{ciudad}}'}</code>, <code>{'{{fecha_suscripcion_larga}}'}</code>, etc.</p></div>
            </SubSeccion>

            <SubSeccion
              titulo={`Cláusulas (${clausulas.length})`}
              open={secOpen.has('clausulas')}
              onToggle={() => toggleSec('clausulas')}
              extra={<Button type="button" size="sm" variant="outline" onClick={agregar}><Plus className="size-4" /> Añadir</Button>}
            >
              {clausulas.map((c, i) => {
                const open = abiertas.has(c.key)
                return (
                  <div
                    key={c.key}
                    draggable={dragKey === c.key}
                    onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move' }}
                    onDragEnd={() => { setDragKey(null); setDragOver(null) }}
                    onDragOver={(e) => { if (dragKey != null) { e.preventDefault(); setDragOver(c.key) } }}
                    onDrop={(e) => { e.preventDefault(); soltar(c.key) }}
                    className={`rounded-md border ${dragOver === c.key && dragKey !== c.key ? 'border-primary ring-1 ring-primary' : ''} ${dragKey === c.key ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-center gap-1 px-2 py-1.5">
                      <button
                        type="button"
                        aria-label="Arrastrar para reordenar"
                        title="Arrastra para reordenar"
                        className="shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
                        onMouseDown={() => setDragKey(c.key)}
                        onMouseUp={() => setDragKey(null)}
                      >
                        <GripVertical className="size-4" />
                      </button>
                      <button type="button" onClick={() => toggle(c.key)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm">
                        {open ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
                        <span className="truncate font-medium">{i + 1}. {c.titulo || '(sin título)'}</span>
                        {c.esFunciones && <span className="shrink-0 rounded bg-primary/10 px-1.5 text-[10px] text-primary">funciones</span>}
                      </button>
                      <Button type="button" size="icon" variant="ghost" className="size-7" onClick={() => mover(i, -1)} disabled={i === 0}><ArrowUp className="size-3.5" /></Button>
                      <Button type="button" size="icon" variant="ghost" className="size-7" onClick={() => mover(i, 1)} disabled={i === clausulas.length - 1}><ArrowDown className="size-3.5" /></Button>
                      <Button type="button" size="icon" variant="ghost" className="size-7 text-destructive" onClick={() => eliminar(c.key)}><Trash2 className="size-3.5" /></Button>
                    </div>
                    {open && (
                      <div className="space-y-2 border-t p-2">
                        <Input value={c.titulo} onChange={(e) => editar(c.key, 'titulo', e.target.value)} placeholder="Título de la cláusula" className="text-sm font-medium" spellCheck lang="es" />
                        <Textarea value={c.cuerpo} onChange={(e) => editar(c.key, 'cuerpo', e.target.value)} rows={5} className="text-xs" placeholder="Texto de la cláusula (admite {{variables}})" spellCheck lang="es" />
                        {c.esFunciones && <p className="text-[11px] text-muted-foreground">Las funciones se editan en la sección «Funciones del cargo» y se insertan aquí.</p>}
                      </div>
                    )}
                  </div>
                )
              })}
              {clausulas.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Sin cláusulas. Añade una.</p>}
            </SubSeccion>

            <SubSeccion titulo="Funciones del cargo" open={secOpen.has('funciones')} onToggle={() => toggleSec('funciones')}>
              <p className="text-xs text-muted-foreground">Se insertan en la cláusula de funciones. Al elegir el cargo se cargan las suyas; puedes añadir, editar o eliminar para este contrato.</p>
              <EditorFunciones value={funciones} onChange={setFunciones} />
            </SubSeccion>

            <SubSeccion titulo="Parte final (Leído, entendido y aprobado)" open={secOpen.has('cierre')} onToggle={() => toggleSec('cierre')}>
              <div className="space-y-1.5"><Textarea rows={4} spellCheck lang="es" {...register('plantillaCierre')} className="text-xs" /><p className="text-xs text-muted-foreground">Aparece justo antes de las firmas.</p></div>
            </SubSeccion>
          </div>
        </Seccion>

        {/* ── Datos de la empresa: prellenado desde Configuración ── */}
        <Seccion
          icono={Building2} color="ink" titulo="Datos de la empresa (contratante)"
          resumen={`${w.empresaRazonSocial ?? ''}${w.empresaNit ? ` · NIT ${w.empresaNit}` : ''}`}
          estado={estadoEmpresa} prellenada
          open={panel.has('empresa')} onToggle={() => togglePanel('empresa')}
        >
          <div className="mb-3 flex items-center gap-2 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            <Lock className="size-3.5 shrink-0" /> Estos datos vienen de Configuración → Empresa. Edítalos aquí solo si este contrato usa datos distintos.
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2"><Label>Razón social</Label><Input spellCheck lang="es" {...register('empresaRazonSocial')} /></div>
            <div className="space-y-1.5"><Label>Marca comercial</Label><Input spellCheck lang="es" {...register('empresaMarca')} /></div>
            <div className="space-y-1.5"><Label>NIT</Label><Input {...register('empresaNit')} /></div>
            <div className="space-y-1.5"><Label>Representante legal</Label><Input spellCheck lang="es" {...register('empresaRepLegal')} /></div>
            <div className="space-y-1.5"><Label>C.C. representante</Label><Input {...register('empresaRepLegalCc')} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Correo de devolución del firmado</Label><Input {...register('empresaCorreoDevolucion')} /></div>
          </div>
        </Seccion>

        <div className="sticky bottom-4 flex items-center justify-between gap-2 rounded-lg border bg-card p-3 shadow-sm">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" {...register('generarPdf')} className="size-4" /> Generar PDF al crear
          </label>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => router.back()}>Cancelar</Button>
            <Button type="submit" disabled={guardando}>{guardando ? <Spinner /> : <Save className="size-4" />} Crear OPS</Button>
          </div>
        </div>
      </form>

      {/* Vista previa (derecha) */}
      <div className="rounded-lg bg-slate-200/60 p-3 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto dark:bg-slate-800/40">
        <PreviewContrato plantilla={plantillaPreview} datos={datos} funciones={funciones} />
      </div>
    </div>
  )
}
