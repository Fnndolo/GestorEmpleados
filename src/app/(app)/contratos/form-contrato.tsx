'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { z } from 'zod'
import { toast } from 'sonner'
import { Save, Plus, Trash2, ChevronDown, ChevronRight, ArrowUp, ArrowDown, GripVertical, User, Coins, CalendarClock, FileText, PencilLine, Eye } from 'lucide-react'
import { renumerarTitulo } from '@/lib/ordinales'
import { cn } from '@/lib/utils'
import { contratoSchema, type ContratoInput } from '@/lib/validaciones/contrato'

type ContratoFormValues = z.input<typeof contratoSchema>
import { crearContrato, actualizarContratoLaboral, datosColaboradorContrato } from './acciones'
import { PreviewLaboral } from './nuevo/preview-laboral'
import { EditorFunciones } from '@/components/contratos/editor-funciones'
import { Seccion, type EstadoSeccion } from '@/components/contratos/seccion-acordeon'
import { plantillaGenericaLaboral } from '@/lib/contrato-plantilla-generica'
import type { ClausulaPlantilla, FuncionesCargo, DatosContrato } from '@/lib/contrato-variables'
import { SelectorColaborador } from '@/components/colaboradores/selector-colaborador'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { duracionContrato } from '@/lib/fechas'
import { avisoVinculoAjustado, avisoReactivacion, type AjusteVinculo, type Reactivacion } from '@/lib/vinculo-contrato'

type ClausulaEdit = { key: number; titulo: string; cuerpo: string; esFunciones: boolean }

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

type Cat = {
  sedes: { id: string; nombre: string; ciudad: string }[]
  cargos: { id: string; nombre: string; funciones?: FuncionesCargo | null }[]
  smmlv: number
  auxTransporte: number
}
type PlantillaTipo = { tipo: string; titulo: string; intro: string; cierre: string; clausulas: ClausulaPlantilla[] }
type EmpresaPreview = {
  razonSocial: string; marca: string | null; nit: string | null
  representanteLegal: string | null; representanteLegalCc: string | null; direccion: string | null
}
type DatosColab = { nombre: string; cc: string; ccLugar: string | null; direccion: string | null; email: string | null; telefono: string | null; genero: string | null }

const fmtCOP = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)

const TIPOS = [
  { v: 'TERMINO_INDEFINIDO', l: 'Término indefinido' },
  { v: 'TERMINO_FIJO', l: 'Término fijo' },
  { v: 'OBRA_LABOR', l: 'Obra o labor' },
  { v: 'APRENDIZAJE_SENA', l: 'Aprendizaje SENA' },
]

/** Meses completos entre dos fechas ISO (para la duración del término fijo). */
function mesesEntre(inicio?: string, fin?: string): number | null {
  if (!inicio || !fin) return null
  const a = new Date(inicio + 'T00:00:00Z')
  const b = new Date(fin + 'T00:00:00Z')
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b <= a) return null
  const meses = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth())
  return Math.max(1, Math.round(meses + (b.getUTCDate() >= a.getUTCDate() - 1 ? 0 : -1)))
}

export type InicialContrato = {
  contratoId: string
  numero: string
  colaboradorNombre: string
  form: Partial<ContratoFormValues>
  doc: { titulo: string; intro: string; cierre: string; clausulas: ClausulaPlantilla[]; funciones: FuncionesCargo | null } | null
}

export function FormContrato({
  catalogos,
  plantillas = [],
  empresa,
  inicial,
}: {
  catalogos: Cat
  plantillas?: PlantillaTipo[]
  empresa?: EmpresaPreview
  /** Modo edición: contrato existente (sin firmas) precargado; guarda con actualizarContratoLaboral. */
  inicial?: InicialContrato
}) {
  const router = useRouter()
  const editando = Boolean(inicial)
  const [guardando, setGuardando] = useState(false)
  const [nombreColab, setNombreColab] = useState(inicial?.colaboradorNombre ?? '')
  const [datosColab, setDatosColab] = useState<DatosColab | null>(null)
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<ContratoFormValues, unknown, ContratoInput>({
    resolver: zodResolver(contratoSchema),
    defaultValues: {
      colaboradorId: '', tipo: 'TERMINO_INDEFINIDO', cargoId: '', sedeId: '', jornada: 'TIEMPO_COMPLETO',
      modalidadTrabajo: 'PRESENCIAL', salarioBase: 0, ganaSalarioMinimo: false, tieneAuxTransporte: true, auxConectividad: 0,
      tipoSalario: 'ORDINARIO', fechaInicio: '', fechaFin: '', objetoObraLabor: '', etapaAprendizaje: '', observaciones: '',
      plantillaTitulo: inicial?.doc?.titulo ?? '', plantillaIntro: inicial?.doc?.intro ?? '', plantillaCierre: inicial?.doc?.cierre ?? '',
      generarPdf: true,
      ...inicial?.form,
    },
  })
  const tipo = watch('tipo')
  const ganaMin = watch('ganaSalarioMinimo')

  // ── Documento editable (título/intro/cierre por react-hook-form; cláusulas y funciones por estado) ──
  const keyRef = useRef(0)
  const nuevaKey = () => ++keyRef.current
  // Inicializa con el documento del contrato (edición) o la plantilla del tipo por
  // defecto (o la genérica), para que la vista previa muestre algo desde el inicio.
  const [clausulas, setClausulas] = useState<ClausulaEdit[]>(() => {
    const base = inicial?.doc ?? plantillas.find((p) => p.tipo === (inicial?.form.tipo ?? 'TERMINO_INDEFINIDO')) ?? plantillaGenericaLaboral()
    return base.clausulas.map((c) => ({ key: nuevaKey(), titulo: c.titulo, cuerpo: c.cuerpo, esFunciones: c.esFunciones }))
  })
  const [abiertas, setAbiertas] = useState<Set<number>>(new Set())
  const [funciones, setFunciones] = useState<FuncionesCargo>(inicial?.doc?.funciones ?? [])
  const [secOpen, setSecOpen] = useState<Set<string>>(new Set())
  const toggleSec = (id: string) => setSecOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const [dragKey, setDragKey] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  // Paneles del acordeón: los tres de datos abiertos; el Documento (plantilla) colapsado.
  const [panel, setPanel] = useState<Set<string>>(new Set(['identificacion', 'remuneracion', 'jornada']))
  const togglePanel = (id: string) => setPanel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  // Móvil: alterna entre editar y ver el documento (en xl se muestran ambos).
  const [vistaMovil, setVistaMovil] = useState<'editar' | 'preview'>('editar')

  // Al cambiar el tipo de contrato se carga SU plantilla (descarta ediciones hechas
  // sobre la plantilla del tipo anterior — cada tipo tiene su propio texto legal).
  // Si el tipo no tiene plantilla sembrada, se usa una genérica de respaldo para
  // que la vista previa muestre un documento con estructura y no un mensaje vacío.
  // En edición, el primer render ya viene con el documento del contrato: no se
  // debe pisar con la plantilla base (solo si el usuario CAMBIA el tipo después).
  const saltarPrimeraPlantilla = useRef(Boolean(inicial?.doc))
  useEffect(() => {
    if (saltarPrimeraPlantilla.current) { saltarPrimeraPlantilla.current = false; return }
    const pl = plantillas.find((p) => p.tipo === tipo) ?? plantillaGenericaLaboral()
    setValue('plantillaTitulo', pl.titulo ?? '')
    setValue('plantillaIntro', pl.intro ?? '')
    setValue('plantillaCierre', pl.cierre ?? '')
    setClausulas((pl.clausulas ?? []).map((c) => ({ key: nuevaKey(), titulo: c.titulo, cuerpo: c.cuerpo, esFunciones: c.esFunciones })))
    setAbiertas(new Set())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo])

  // Datos del colaborador para la vista previa (cc, dirección, correo…).
  const colaboradorId = watch('colaboradorId')
  useEffect(() => {
    let cancelado = false
    if (!colaboradorId) { setDatosColab(null); return }
    datosColaboradorContrato({ colaboradorId }).then((res) => {
      if (!cancelado && res.ok) setDatosColab(res.datos as DatosColab)
    })
    return () => { cancelado = true }
  }, [colaboradorId])

  // Al elegir cargo se cargan sus funciones (editables solo para este contrato).
  function aplicarCargo(cargoId: string) {
    setValue('cargoId', cargoId)
    const cargo = catalogos.cargos.find((c) => c.id === cargoId)
    setFunciones(cargo?.funciones ?? [])
  }

  // ── edición de cláusulas (mismo patrón del form OPS) ──
  function toggle(key: number) {
    setAbiertas((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n })
  }
  function editarClausula(key: number, campo: 'titulo' | 'cuerpo', valor: string) {
    setClausulas((cs) => cs.map((c) => (c.key === key ? { ...c, [campo]: valor } : c)))
  }
  /** Reescribe el ordinal del título de cada cláusula según su posición (1 → PRIMERA…). */
  function renumerar(cs: ClausulaEdit[]): ClausulaEdit[] {
    return cs.map((c, i) => ({ ...c, titulo: renumerarTitulo(c.titulo, i + 1) }))
  }
  function eliminarClausula(key: number) {
    setClausulas((cs) => renumerar(cs.filter((c) => c.key !== key)))
  }
  function mover(i: number, dir: -1 | 1) {
    setClausulas((cs) => {
      const j = i + dir
      if (j < 0 || j >= cs.length) return cs
      const n = [...cs]; [n[i], n[j]] = [n[j], n[i]]; return renumerar(n)
    })
  }
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
  function agregarClausula() {
    const key = nuevaKey()
    setClausulas((cs) => [...cs, { key, titulo: 'NUEVA CLÁUSULA:', cuerpo: '', esFunciones: false }])
    setAbiertas((s) => new Set(s).add(key))
    setSecOpen((s) => new Set(s).add('clausulas'))
  }

  async function onSubmit(d: ContratoInput) {
    setGuardando(true)
    const payload = {
      ...d,
      clausulas: clausulas.map(({ titulo, cuerpo, esFunciones }) => ({ titulo, cuerpo, esFunciones })),
      funciones,
    }
    const res = editando
      ? await actualizarContratoLaboral({ ...payload, contratoId: inicial!.contratoId })
      : await crearContrato(payload)
    setGuardando(false)
    if (res.ok) {
      toast.success(editando ? 'Contrato actualizado y documento regenerado.' : 'Contrato creado.')
      const datos = res.datos as { vinculoAjustado?: AjusteVinculo; reactivado?: Reactivacion | null }
      for (const aviso of [avisoReactivacion(datos.reactivado), avisoVinculoAjustado(datos.vinculoAjustado)]) {
        if (aviso) toast.info(aviso, { duration: 8000 })
      }
      router.push(`/contratos/${editando ? inicial!.contratoId : (res.datos as { id: string }).id}`)
      router.refresh()
    } else toast.error(res.error)
  }

  // ── Vista previa en vivo (usa el TEXTO EDITADO, no la plantilla cruda) ────
  const hayPlantillaBase = plantillas.some((p) => p.tipo === tipo)
  const plantilla = hayPlantillaBase || clausulas.length > 0
    ? {
        titulo: watch('plantillaTitulo') || 'CONTRATO DE TRABAJO',
        intro: watch('plantillaIntro') || '',
        cierre: watch('plantillaCierre') || '',
        clausulas: clausulas.map((c, i) => ({ titulo: c.titulo, cuerpo: c.cuerpo, esFunciones: c.esFunciones, orden: i + 1 })),
      }
    : null
  const cargoSel = catalogos.cargos.find((c) => c.id === watch('cargoId'))
  const sedeSel = catalogos.sedes.find((s) => s.id === watch('sedeId'))
  const salario = ganaMin ? catalogos.smmlv : Number(watch('salarioBase')) || 0
  const aplicaAux = watch('tieneAuxTransporte') !== false && watch('tipoSalario') === 'ORDINARIO' && catalogos.smmlv > 0 && salario > 0 && salario <= 2 * catalogos.smmlv
  const fechaInicio = watch('fechaInicio')
  const fechaFin = watch('fechaFin')
  // Duración pactada, en vivo: se ve lo que se está firmando al elegir las fechas.
  const duracion = duracionContrato(
    fechaInicio ? new Date(`${fechaInicio}T00:00:00Z`) : null,
    fechaFin ? new Date(`${fechaFin}T00:00:00Z`) : null,
  )
  const hoyIso = new Date().toISOString().slice(0, 10)

  // ── estado de cada sección para las píldoras del acordeón ──
  const estadoIdentificacion: EstadoSeccion = !watch('colaboradorId')
    ? { tono: 'warn', texto: 'Elige el colaborador' }
    : !watch('sedeId')
      ? { tono: 'warn', texto: 'Falta la sede' }
      : { tono: 'ok', texto: 'Completo' }
  const estadoRemuneracion: EstadoSeccion = salario <= 0
    ? { tono: 'warn', texto: 'Falta el salario' }
    : { tono: 'ok', texto: aplicaAux ? `${fmtCOP(salario)} + auxilio` : fmtCOP(salario) }
  const faltaJornada = !fechaInicio ? 'Falta la fecha de inicio'
    : tipo === 'TERMINO_FIJO' && !fechaFin ? 'Falta la fecha de fin'
    : tipo === 'OBRA_LABOR' && !(watch('objetoObraLabor') ?? '').trim() ? 'Falta el objeto de la obra'
    : null
  const estadoJornada: EstadoSeccion = faltaJornada
    ? { tono: 'warn', texto: faltaJornada }
    : { tono: 'ok', texto: 'Completo' }
  const estadoDocumento: EstadoSeccion = hayPlantillaBase
    ? { tono: 'muted', texto: 'Desde la plantilla', auto: true }
    : { tono: 'muted', texto: 'Plantilla genérica', auto: true }

  const datosPreview: DatosContrato = {
    empresa: {
      razonSocial: empresa?.razonSocial ?? '',
      marca: empresa?.marca,
      nit: empresa?.nit,
      representanteLegal: empresa?.representanteLegal,
      representanteLegalCc: empresa?.representanteLegalCc,
      direccion: empresa?.direccion,
    },
    contratista: {
      nombre: datosColab?.nombre ?? (nombreColab || null),
      cc: datosColab?.cc,
      ccLugar: datosColab?.ccLugar,
      direccion: datosColab?.direccion,
      email: datosColab?.email,
      telefono: datosColab?.telefono,
      genero: datosColab?.genero,
    },
    contrato: {
      numero: inicial?.numero ?? null, // al crear se asigna automático (CT-año-####)
      ciudad: sedeSel?.ciudad ?? null,
      fechaSuscripcion: hoyIso,
      fechaInicio: fechaInicio || null,
      fechaFin: fechaFin || null,
      plazoMeses: mesesEntre(fechaInicio, fechaFin),
      salarioMensual: salario > 0 ? salario : null,
      auxTransporte: aplicaAux ? catalogos.auxTransporte : 0,
      cargoObjeto: cargoSel?.nombre ?? null,
    },
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
    {/* Pestañas Editar / Vista previa — solo en pantallas menores a xl */}
    <div className="flex gap-1.5 rounded-lg border bg-muted/40 p-1 xl:hidden">
      <button type="button" onClick={() => setVistaMovil('editar')} className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium', vistaMovil === 'editar' ? 'bg-card shadow-sm' : 'text-muted-foreground')}>
        <PencilLine className="size-4" /> Editar
      </button>
      <button type="button" onClick={() => setVistaMovil('preview')} className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium', vistaMovil === 'preview' ? 'bg-card shadow-sm' : 'text-muted-foreground')}>
        <Eye className="size-4" /> Vista previa
      </button>
    </div>

    <form onSubmit={handleSubmit(onSubmit)} className={cn('space-y-2.5 self-start', vistaMovil === 'preview' && 'hidden xl:block')}>
      {/* ── Identificación ── */}
      <Seccion
        icono={User} color="violet" titulo="Identificación"
        resumen={nombreColab || 'Colaborador, tipo de vínculo, sede y cargo'}
        estado={estadoIdentificacion}
        open={panel.has('identificacion')} onToggle={() => togglePanel('identificacion')}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Colaborador</Label>
            <SelectorColaborador value={watch('colaboradorId')} onChange={(id, n) => { setValue('colaboradorId', id); setNombreColab(n) }} />
            {nombreColab && <p className="text-xs text-muted-foreground">Seleccionado: {nombreColab}</p>}
            {errors.colaboradorId && <p className="text-xs text-destructive">{errors.colaboradorId.message}</p>}
          </div>
          <Campo label="Tipo de contrato">
            <Select value={tipo} onValueChange={(v) => setValue('tipo', v as ContratoInput['tipo'])}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{TIPOS.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
            </Select>
          </Campo>
          <Campo label="Modalidad de trabajo">
            <Select value={watch('modalidadTrabajo')} onValueChange={(v) => setValue('modalidadTrabajo', v as ContratoInput['modalidadTrabajo'])}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PRESENCIAL">Presencial</SelectItem>
                <SelectItem value="REMOTO">Remoto</SelectItem>
                <SelectItem value="HIBRIDO">Híbrido</SelectItem>
                
              </SelectContent>
            </Select>
          </Campo>
          <Campo label="Sede" error={errors.sedeId?.message}>
            <Select value={watch('sedeId')} onValueChange={(v) => setValue('sedeId', v)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
              <SelectContent>{catalogos.sedes.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre} · {s.ciudad}</SelectItem>)}</SelectContent>
            </Select>
          </Campo>
          <Campo label="Cargo">
            <Select value={watch('cargoId') || undefined} onValueChange={aplicarCargo}>
              <SelectTrigger className="w-full"><SelectValue placeholder="— Sin definir —" /></SelectTrigger>
              <SelectContent>{catalogos.cargos.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
            </Select>
          </Campo>
        </div>
      </Seccion>

      {/* ── Remuneración ── */}
      <Seccion
        icono={Coins} color="emerald" titulo="Remuneración"
        resumen="Salario, tipo y auxilios"
        estado={estadoRemuneracion}
        open={panel.has('remuneracion')} onToggle={() => togglePanel('remuneracion')}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 flex items-center gap-2 rounded-lg border p-3">
            <Checkbox id="ganaMin" checked={ganaMin} onCheckedChange={(c) => { const on = c === true; setValue('ganaSalarioMinimo', on); setValue('salarioBase', on ? catalogos.smmlv : 0) }} />
            <Label htmlFor="ganaMin" className="font-normal">Gana salario mínimo {catalogos.smmlv > 0 && <span className="text-muted-foreground">({fmtCOP(catalogos.smmlv)} — se actualiza con el parámetro)</span>}</Label>
          </div>
          {!ganaMin && (
            <Campo label="Salario base" error={errors.salarioBase?.message}>
              <Input type="number" step="1" {...register('salarioBase')} />
            </Campo>
          )}
          <Campo label="Tipo de salario">
            <Select value={watch('tipoSalario')} onValueChange={(v) => setValue('tipoSalario', v as ContratoInput['tipoSalario'])}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ORDINARIO">Ordinario</SelectItem>
                <SelectItem value="INTEGRAL">Integral</SelectItem>
              </SelectContent>
            </Select>
          </Campo>
          <div className="sm:col-span-2 flex items-center gap-2 rounded-lg border p-3">
            <Checkbox id="auxT" checked={watch('tieneAuxTransporte') !== false} onCheckedChange={(c) => setValue('tieneAuxTransporte', c === true)} />
            <Label htmlFor="auxT" className="font-normal">Tiene auxilio de transporte {catalogos.auxTransporte > 0 && <span className="text-muted-foreground">({fmtCOP(catalogos.auxTransporte)}/mes si es elegible ≤2 SMMLV)</span>}</Label>
          </div>
          <Campo label="Auxilio de conectividad (opcional, valor mensual)">
            <Input type="number" step="1" {...register('auxConectividad')} placeholder="0" />
          </Campo>
        </div>
      </Seccion>

      {/* ── Jornada y vigencia ── */}
      <Seccion
        icono={CalendarClock} color="sky" titulo="Jornada y vigencia"
        resumen="Horas, fechas, periodo de prueba y condiciones"
        estado={estadoJornada}
        open={panel.has('jornada')} onToggle={() => togglePanel('jornada')}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Jornada">
            <Select value={watch('jornada')} onValueChange={(v) => setValue('jornada', v as ContratoInput['jornada'])}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TIEMPO_COMPLETO">Tiempo completo</SelectItem>
                <SelectItem value="MEDIO_TIEMPO">Medio tiempo</SelectItem>
                <SelectItem value="POR_DIAS">Por días</SelectItem>
              </SelectContent>
            </Select>
          </Campo>
          <Campo label="Horas semanales">
            <Input type="number" {...register('horasSemanales')} placeholder="42" />
          </Campo>
          <Campo label="Fecha de inicio" error={errors.fechaInicio?.message}>
            <Input type="date" {...register('fechaInicio')} />
          </Campo>
          {tipo === 'TERMINO_FIJO' && (
            <Campo label="Fecha de fin (término fijo)">
              <Input type="date" {...register('fechaFin')} />
            </Campo>
          )}
          {duracion && (
            <Campo label="Duración">
              <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">{duracion}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Se calcula de las fechas; el último día cuenta.
              </p>
            </Campo>
          )}
          <Campo label="Días de periodo de prueba">
            <Input type="number" {...register('periodoPruebaDias')} placeholder="60" />
          </Campo>
          {tipo === 'OBRA_LABOR' && (
            <Campo label="Objeto de la obra o labor" full>
              <Textarea {...register('objetoObraLabor')} rows={2} />
            </Campo>
          )}
          {tipo === 'APRENDIZAJE_SENA' && (
            <Campo label="Etapa de aprendizaje">
              <Select value={watch('etapaAprendizaje') || undefined} onValueChange={(v) => setValue('etapaAprendizaje', v as 'LECTIVA')}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="LECTIVA">Lectiva</SelectItem>
                  <SelectItem value="PRODUCTIVA">Productiva</SelectItem>
                </SelectContent>
              </Select>
            </Campo>
          )}
          <Campo label="Observaciones" full>
            <Textarea {...register('observaciones')} rows={2} />
          </Campo>
        </div>
      </Seccion>

      {/* ── Documento del contrato: prellenado desde la plantilla del tipo ── */}
      <Seccion
        icono={FileText} color="sky" titulo="Documento del contrato"
        resumen={`Título, ${clausulas.length} cláusula${clausulas.length === 1 ? '' : 's'}, funciones y cierre`}
        estado={estadoDocumento} prellenada={Boolean(plantilla)}
        open={panel.has('documento')} onToggle={() => togglePanel('documento')}
      >
        <div className="space-y-2">
          {!plantilla && (
            <p className="text-sm text-muted-foreground">
              Este tipo de contrato no tiene plantilla. Puedes añadir cláusulas manualmente, o crearlo sin documento.
            </p>
          )}
          <SubSeccion titulo="Encabezado (título e introducción)" open={secOpen.has('encabezado')} onToggle={() => toggleSec('encabezado')}>
            <div className="space-y-1.5"><Label>Título</Label><Input spellCheck lang="es" {...register('plantillaTitulo')} /></div>
            <div className="space-y-1.5">
              <Label>Párrafo introductorio</Label>
              <Textarea rows={5} spellCheck lang="es" {...register('plantillaIntro')} className="text-xs" />
              <p className="text-xs text-muted-foreground">Variables: <code>{'{{empleado_nombre}}'}</code>, <code>{'{{ciudad}}'}</code>, <code>{'{{salario_mcte_letras}}'}</code>, <code>{'{{fecha_inicio_larga}}'}</code>, etc.</p>
            </div>
          </SubSeccion>

          <SubSeccion
            titulo={`Cláusulas (${clausulas.length})`}
            open={secOpen.has('clausulas')}
            onToggle={() => toggleSec('clausulas')}
            extra={<Button type="button" size="sm" variant="outline" onClick={agregarClausula}><Plus className="size-4" /> Añadir</Button>}
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
                    <Button type="button" size="icon" variant="ghost" className="size-7 text-destructive" onClick={() => eliminarClausula(c.key)}><Trash2 className="size-3.5" /></Button>
                  </div>
                  {open && (
                    <div className="space-y-2 border-t p-2">
                      <Input value={c.titulo} onChange={(e) => editarClausula(c.key, 'titulo', e.target.value)} placeholder="Título de la cláusula" className="text-sm font-medium" spellCheck lang="es" />
                      <Textarea value={c.cuerpo} onChange={(e) => editarClausula(c.key, 'cuerpo', e.target.value)} rows={5} className="text-xs" placeholder="Texto de la cláusula (admite {{variables}}; líneas con «- » salen como viñetas)" spellCheck lang="es" />
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

      <div className="sticky bottom-4 flex items-center justify-between gap-2 rounded-lg border bg-card p-3 shadow-sm">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" {...register('generarPdf')} className="size-4" /> {editando ? 'Regenerar PDF al guardar' : 'Generar PDF al crear'}
        </label>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={() => router.back()}>Cancelar</Button>
          <Button type="submit" disabled={guardando}>{guardando ? <Spinner /> : <Save className="size-4" />} {editando ? 'Guardar cambios' : 'Crear contrato'}</Button>
        </div>
      </div>
    </form>

    {/* Vista previa del documento (misma hoja del PDF), en vivo con lo diligenciado.
        En xl siempre visible; en móvil, solo con la pestaña "Vista previa". */}
    <div className={cn(vistaMovil === 'preview' ? 'block' : 'hidden', 'xl:block')}>
      <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-lg border bg-muted/30 p-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Vista previa · {TIPOS.find((t) => t.v === tipo)?.l}
        </p>
        <PreviewLaboral
          plantilla={plantilla}
          datos={datosPreview}
          funciones={funciones}
          tipoLabel={(TIPOS.find((t) => t.v === tipo)?.l ?? tipo).toUpperCase()}
        />
      </div>
    </div>
    </div>
  )
}

function Campo({ label, error, full, children }: { label: string; error?: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={`space-y-1.5 ${full ? 'sm:col-span-2' : ''}`}>
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
