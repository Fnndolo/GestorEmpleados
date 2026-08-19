'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import Link from 'next/link'
import { Plus, Stethoscope, TriangleAlert, Users, HardHat, ShieldAlert, Paperclip, OctagonAlert, Flame, ClipboardCheck, IdCard, Landmark, Scale, CircleCheck, CircleAlert, CircleX, FileWarning, LayoutGrid, ChartLine, ChevronLeft } from 'lucide-react'
import { Chip, Pill, Stat, type PillTone } from '@/components/ui-kit'
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
import { formatFechaCorta } from '@/lib/fechas'
import { cn } from '@/lib/utils'
import {
  crearComite, registrarReunionComite, vincularActaReunion, agregarMiembroComite, eliminarMiembroComite,
  crearExamenMedico, vincularSoporteExamen, reportarAccidente, actualizarAccidente, entregarEpp, crearEpp,
  registrarAutoevaluacion, crearPeligro, guardarProfesiograma, crearPlanEmergencia, vincularDocumentoPlanEmergencia,
  agregarBrigadista, eliminarBrigadista, registrarSimulacro, vincularDocumentoSimulacro, registrarInspeccion,
  vincularDocumentoInspeccion, cerrarInspeccion,
  designarResponsableSgsst, vincularCartaResponsable, guardarPlanTrabajoSst, vincularDocumentoPlanTrabajo,
  marcarPoliticaSgsst, guardarNormaMatrizLegal, vincularEvidenciaNorma, eliminarNormaMatrizLegal,
  guardarIndicadorSst,
  vincularDocumentoAutoeval, crearAccionMejora, marcarAccionMejora, vincularEvidenciaAccionMejora, eliminarAccionMejora,
  registrarNovedadArl, vincularSoporteNovedadArl, crearSeguimientoExamen, cerrarSeguimientoExamen,
} from './acciones'

const TITULO_TAB: Record<string, string> = {
  tablero: 'Tablero',
  estructura: 'Estructura del SG-SST', matriz: 'Matriz legal (normograma)', examenes: 'Exámenes médicos',
  arl: 'Novedades de ARL', accidentes: 'Accidentes e incidentes', comites: 'Comités', epp: 'Elementos de protección personal',
  ipevr: 'Matriz de peligros (IPEVR)', profesiograma: 'Profesiograma', emergencias: 'Plan de emergencias',
  inspecciones: 'Inspecciones de seguridad', autoeval: 'Autoevaluación y plan de mejora', indicadores: 'Indicadores de accidentalidad',
}
const CUMPLIMIENTO: Record<string, string> = { CUMPLE: 'Cumple', PARCIAL: 'Parcial', NO_CUMPLE: 'No cumple' }
const TIPO_NOVEDAD_ARL: Record<string, string> = { AFILIACION: 'Afiliación', RETIRO: 'Retiro', TRASLADO_ARL: 'Traslado de ARL', CAMBIO_CLASE_RIESGO: 'Cambio de clase de riesgo', OTRA: 'Otra' }
const TONO_CUMPLIMIENTO: Record<string, PillTone> = { CUMPLE: 'ok', PARCIAL: 'warn', NO_CUMPLE: 'bad' }
const TIPO_COMITE: Record<string, string> = { VIGIA_SST: 'Vigía SST', COPASST: 'COPASST', CONVIVENCIA: 'Comité de Convivencia' }
const ESTADO_ACCIDENTE: Record<string, string> = { REPORTADO: 'Reportado', EN_INVESTIGACION: 'En investigación', CERRADO: 'Cerrado' }
const TONO_ESTADO_ACCIDENTE: Record<string, PillTone> = { REPORTADO: 'warn', EN_INVESTIGACION: 'warn', CERRADO: 'ok' }
const CONCEPTO: Record<string, string> = { APTO: 'Apto', APTO_CON_RECOMENDACIONES: 'Apto con recomendaciones', NO_APTO: 'No apto', APLAZADO: 'Aplazado' }
const NIVEL: Record<string, string> = { BAJO: 'Bajo', MEDIO: 'Medio', ALTO: 'Alto', CRITICO: 'Crítico' }
const TONO_CONCEPTO: Record<string, PillTone> = { APTO: 'ok', APTO_CON_RECOMENDACIONES: 'warn', NO_APTO: 'bad', APLAZADO: 'muted' }
const TONO_NIVEL: Record<string, PillTone> = { BAJO: 'ok', MEDIO: 'warn', ALTO: 'bad', CRITICO: 'bad' }

type Props = {
  tab: string; puedeCrear: boolean; puedeEditar: boolean; verSalud: boolean; headcount: number
  comites: {
    id: string; tipo: string; vigenciaHasta: string
    miembros: { id: string; colaborador: string; rol: string; porEmpleador: boolean }[]
    reuniones: { id: string; fecha: string; temas: string; compromisos: string | null; actaDocId: string | null }[]
  }[]
  examenes: {
    id: string; colaboradorId: string; colaborador: string; tipo: string; fecha: string; concepto: string
    vencimiento: string | null; vencido: boolean; tieneRestricciones: boolean; documentoId: string | null
    recomendaciones: string | null; restricciones: string | null; seguimientoCerrado: boolean
    seguimientos: { id: string; fecha: string; nota: string }[]
  }[]
  novedadesArl: {
    id: string; colaborador: string; tipo: string; fecha: string; detalle: string | null
    claseRiesgo: string | null; soporteDocId: string | null
  }[]
  accidentes: {
    id: string; colaborador: string; fecha: string; descripcion: string; parteCuerpo: string | null
    diasIncapacidad: number | null; estado: string; furat: boolean; investigacion: string | null; esIncidente: boolean
    documentos: { id: string; nombre: string }[]
  }[]
  epps: { id: string; nombre: string }[]
  entregasEpp: { id: string; colaborador: string; elemento: string; cantidad: number; fecha: string; firmado: boolean; soporteDocId: string | null }[]
  peligros: {
    id: string; proceso: string; peligro: string; riesgo: string; nivel: string; controles: string | null
    rutinaria: boolean; controlFuente: string | null; controlMedio: string | null; controlIndividuo: string | null
    responsable: string | null; fechaRevision: string | null; sede: string | null
  }[]
  autoeval: {
    id: string; anio: number; puntaje: number; nivelEstandar: number; planMejora: string | null; documentoId: string | null
    acciones: {
      id: string; actividad: string; responsable: string; fechaLimite: string; vencida: boolean; recursos: string | null
      cumplida: boolean; cumplidaEn: string | null; evidenciaDocId: string | null
    }[]
  } | null
  sedes: { id: string; nombre: string }[]
  cargos: { id: string; nombre: string }[]
  profesiogramas: { id: string; cargoId: string; cargo: string; riesgosExpuestos: string; examenesRequeridos: string; aptitudesRequeridas: string; restricciones: string | null }[]
  planesEmergencia: { id: string; version: string; vigenciaDesde: string; vigenciaHasta: string; vencido: boolean; documentoId: string | null; sede: string | null }[]
  brigadistas: { id: string; colaborador: string; rol: string; sede: string | null }[]
  simulacros: { id: string; fecha: string; tipo: string; participantes: number | null; observaciones: string | null; documentoId: string | null; sede: string | null }[]
  inspecciones: { id: string; fecha: string; tipo: string; area: string | null; hallazgos: string; responsable: string | null; estado: string; fechaCierre: string | null; documentoId: string | null; sede: string | null }[]
  semaforo: { label: string; estado: 'ok' | 'warn' | 'bad'; detalle: string; tab: string }[]
  estructura: {
    politica: { id: string; titulo: string; firmadaEn: string | null } | null
    politicasDisponibles: { id: string; titulo: string; esSgSst: boolean }[]
    responsable: { id: string; colaborador: string; fechaDesignacion: string; licenciaSst: string | null; cursoHoras: number | null; cartaDocId: string | null } | null
    plan: { id: string; anio: number; documentoId: string | null; aprobadoPor: string | null; avancePct: number; notas: string | null } | null
    anioActual: number
  }
  normas: {
    id: string; norma: string; emisor: string | null; tema: string; articulos: string | null
    comoCumple: string | null; cumplimiento: string; evidenciaDocId: string | null; responsableRol: string | null
  }[]
  indicadores: {
    anio: number; mes: number; numTrabajadores: number; horasHombre: number; diasAusentismo: number
    numAccidentes: number; diasPerdidos: number; frecuencia: number; severidad: number; ausentismo: number
    tono: 'emerald' | 'amber' | 'destructive'
  }[]
}

export function SstCliente(p: Props) {
  // La sección vive en estado, no en la URL: cambiar de sección no recarga la
  // página ni pierde el scroll. La URL se sincroniza con history.pushState para
  // que los enlaces `/sst?tab=x` sigan sirviendo y el botón Atrás funcione.
  const [tab, setTab] = useState(p.tab)

  const irA = useCallback((destino: string) => {
    setTab(destino)
    const url = destino === 'tablero' ? '/sst' : `/sst?tab=${destino}`
    window.history.pushState({ tab: destino }, '', url)
    // El panel puede quedar más arriba que el punto donde se hizo clic.
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    const alVolver = () => {
      const params = new URLSearchParams(window.location.search)
      setTab(params.get('tab') ?? 'tablero')
    }
    window.addEventListener('popstate', alVolver)
    return () => window.removeEventListener('popstate', alVolver)
  }, [])

  // Si se llega a /sst desde fuera (menú lateral, un enlace de otro módulo), el
  // servidor manda el tab de la URL y hay que obedecerlo: sin esto el panel se
  // quedaría en la sección anterior porque el componente no se desmonta.
  // Se ajusta durante el render —el patrón que React recomienda para derivar
  // estado de una prop— en vez de en un efecto, que provocaría un repintado extra.
  const [tabDeLaUrl, setTabDeLaUrl] = useState(p.tab)
  if (p.tab !== tabDeLaUrl) {
    setTabDeLaUrl(p.tab)
    setTab(p.tab)
  }

  const router = useRouter()
  const [dialogo, setDialogo] = useState<string | null>(null)
  const [accidenteAbierto, setAccidenteAbierto] = useState<Props['accidentes'][number] | null>(null)
  const [comiteAbierto, setComiteAbierto] = useState<Props['comites'][number] | null>(null)
  const [inspeccionAbierta, setInspeccionAbierta] = useState<Props['inspecciones'][number] | null>(null)
  const [normaAbierta, setNormaAbierta] = useState<Props['normas'][number] | null>(null)
  const [examenAbierto, setExamenAbierto] = useState<Props['examenes'][number] | null>(null)
  const [indicadorAbierto, setIndicadorAbierto] = useState(false)
  const recomendacion = p.headcount < 10 ? 'Vigía SST' : 'COPASST'
  const MES: Record<number, string> = { 1: 'Ene', 2: 'Feb', 3: 'Mar', 4: 'Abr', 5: 'May', 6: 'Jun', 7: 'Jul', 8: 'Ago', 9: 'Sep', 10: 'Oct', 11: 'Nov', 12: 'Dic' }

  // Pendientes por módulo para las pills del hub
  const e = p.estructura
  const pendEstructura = [e.politica?.firmadaEn, e.responsable?.cartaDocId, e.plan?.documentoId].filter((x) => !x).length
  const normasSinCumplir = p.normas.filter((n) => n.cumplimiento !== 'CUMPLE').length
  const accionesMejora = p.autoeval?.acciones ?? []
  const examenesVencidos = p.examenes.filter((x) => x.vencido).length
  const furatPendientes = p.accidentes.filter((a) => !a.furat && !a.esIncidente).length
  const ipevrCriticos = p.peligros.filter((x) => x.nivel === 'CRITICO' || x.nivel === 'ALTO').length
  const planVigente = p.planesEmergencia.some((x) => !x.vencido)
  const inspAbiertas = p.inspecciones.filter((i) => i.estado !== 'CERRADA').length
  const eppSinFirma = p.entregasEpp.filter((x) => !x.firmado).length
  const semComites = p.semaforo.find((s) => s.tab === 'comites')

  const SECCIONES: { titulo: string; tiles: { tab: string; titulo: string; desc: string; icono: typeof Landmark; color: 'sky' | 'violet' | 'emerald' | 'amber' | 'rose' | 'indigo' | 'teal' | 'ink'; pill: React.ReactNode }[] }[] = [
    {
      titulo: 'Sistema de gestión',
      tiles: [
        { tab: 'estructura', titulo: 'Estructura', desc: 'Política, responsable, plan anual', icono: Landmark, color: 'sky', pill: pendEstructura > 0 ? <Pill tone="warn">{pendEstructura} pend.</Pill> : <Pill tone="ok">Al día</Pill> },
        { tab: 'matriz', titulo: 'Matriz legal', desc: `${p.normas.length} normas del normograma`, icono: Scale, color: 'violet', pill: normasSinCumplir > 0 ? <Pill tone="bad">{normasSinCumplir} sin cumplir</Pill> : <Pill tone="ok">Al día</Pill> },
        { tab: 'autoeval', titulo: 'Autoevaluación', desc: p.autoeval ? `${p.autoeval.anio} · ${p.autoeval.puntaje}% · plan de mejora` : 'Estándares mínimos', icono: CircleCheck, color: 'emerald', pill: !p.autoeval ? <Pill tone="bad">Falta</Pill> : accionesMejora.length ? <Pill tone={accionesMejora.some((a) => a.vencida) ? 'warn' : 'ok'}>{accionesMejora.filter((a) => a.cumplida).length}/{accionesMejora.length}</Pill> : <Pill tone="muted">Sin acciones</Pill> },
      ],
    },
    {
      titulo: 'Salud ocupacional',
      tiles: [
        { tab: 'examenes', titulo: 'Exámenes médicos', desc: 'Ingreso, periódicos, egreso', icono: Stethoscope, color: 'rose', pill: examenesVencidos > 0 ? <Pill tone="bad">{examenesVencidos} vencido{examenesVencidos === 1 ? '' : 's'}</Pill> : <Pill tone="muted">{p.examenes.length}</Pill> },
        { tab: 'arl', titulo: 'Novedades ARL', desc: 'Afiliaciones, traslados, clase de riesgo', icono: ShieldAlert, color: 'emerald', pill: <Pill tone="muted">{p.novedadesArl.length}</Pill> },
        { tab: 'accidentes', titulo: 'Accidentes e incidentes', desc: 'FURAT, investigación, seguimiento', icono: TriangleAlert, color: 'amber', pill: furatPendientes > 0 ? <Pill tone="bad">{furatPendientes} FURAT</Pill> : <Pill tone="muted">{p.accidentes.length}</Pill> },
      ],
    },
    {
      titulo: 'Riesgos y emergencias',
      tiles: [
        { tab: 'ipevr', titulo: 'Matriz IPEVR', desc: 'Peligros por sede (GTC 45)', icono: ShieldAlert, color: 'rose', pill: ipevrCriticos > 0 ? <Pill tone="warn">{ipevrCriticos} alto/crítico</Pill> : <Pill tone="muted">{p.peligros.length}</Pill> },
        { tab: 'profesiograma', titulo: 'Profesiograma', desc: 'Perfiles de riesgo por cargo', icono: IdCard, color: 'indigo', pill: <Pill tone="muted">{p.profesiogramas.length} cargo{p.profesiogramas.length === 1 ? '' : 's'}</Pill> },
        { tab: 'emergencias', titulo: 'Emergencias', desc: 'Plan, brigadistas, simulacros', icono: Flame, color: 'amber', pill: planVigente ? <Pill tone="ok">Vigente</Pill> : <Pill tone="bad">Sin plan</Pill> },
      ],
    },
    {
      titulo: 'Operación',
      tiles: [
        { tab: 'inspecciones', titulo: 'Inspecciones', desc: 'Locativas, extintores, ergonómicas', icono: ClipboardCheck, color: 'teal', pill: inspAbiertas > 0 ? <Pill tone="warn">{inspAbiertas} abierta{inspAbiertas === 1 ? '' : 's'}</Pill> : <Pill tone="ok">Al día</Pill> },
        { tab: 'comites', titulo: 'Comités', desc: `Recomendado: ${recomendacion} + Convivencia`, icono: Users, color: 'teal', pill: semComites ? <Pill tone={semComites.estado === 'ok' ? 'ok' : semComites.estado === 'warn' ? 'warn' : 'bad'}>{semComites.detalle}</Pill> : null },
        { tab: 'epp', titulo: 'EPP', desc: 'Entregas con recibido firmado', icono: HardHat, color: 'indigo', pill: eppSinFirma > 0 ? <Pill tone="warn">{eppSinFirma} sin firma</Pill> : <Pill tone="ok">Al día</Pill> },
      ],
    },
  ]

  const GRUPOS: { titulo: string; items: { tab: string; etiqueta: string; icono: typeof Landmark }[] }[] = [
    {
      titulo: 'Vista general',
      items: [
        { tab: 'tablero', etiqueta: 'Tablero', icono: LayoutGrid },
        { tab: 'indicadores', etiqueta: 'Indicadores', icono: ChartLine },
      ],
    },
    ...SECCIONES.map((sec) => ({
      titulo: sec.titulo,
      items: sec.tiles.map((t) => ({ tab: t.tab, etiqueta: t.titulo, icono: t.icono })),
    })),
  ]

  /** Flechas para recorrer las secciones sin soltar el teclado (patrón ARIA de tabs). */
  const todasLasTabs = GRUPOS.flatMap((g) => g.items.map((i) => i.tab))
  function navegarConTeclado(e: React.KeyboardEvent<HTMLElement>) {
    const salto = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key]
    if (!salto && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const i = todasLasTabs.indexOf(tab)
    const destino = e.key === 'Home' ? todasLasTabs[0]
      : e.key === 'End' ? todasLasTabs[todasLasTabs.length - 1]
      : todasLasTabs[(i + salto! + todasLasTabs.length) % todasLasTabs.length]
    irA(destino)
    document.getElementById(`tab-${destino}`)?.focus()
  }

  /**
   * Menú completo y quieto, al estilo de una pantalla de ajustes: todas las
   * secciones a la vista, y la elegida marcada con una barra de acento a la
   * izquierda en vez de un relleno fuerte.
   */
  const riel = (
    <nav
      role="tablist"
      aria-label="Secciones de SST"
      aria-orientation="vertical"
      onKeyDown={navegarConTeclado}
      className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:sticky lg:top-4 lg:mx-0 lg:flex-col lg:gap-px lg:overflow-visible lg:px-0 lg:pb-0"
    >
      {GRUPOS.map((g) => (
        <div key={g.titulo} className="contents lg:block">
          <p className="hidden px-3 pt-3.5 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground first:pt-0 lg:block">
            {g.titulo}
          </p>
          {g.items.map((it) => {
            const activo = it.tab === tab
            return (
              <button
                key={it.tab}
                id={`tab-${it.tab}`}
                type="button"
                role="tab"
                aria-selected={activo}
                aria-controls={`panel-${it.tab}`}
                tabIndex={activo ? 0 : -1}
                onClick={() => irA(it.tab)}
                className={cn(
                  'relative flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-[13.5px] transition-colors lg:w-full',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                  // En móvil son pastillas sueltas; en escritorio, filas de menú.
                  'border bg-card lg:border-0 lg:bg-transparent',
                  activo
                    ? 'border-primary font-semibold text-foreground lg:bg-card lg:shadow-sm'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                )}
              >
                {activo && (
                  <span aria-hidden className="absolute left-0 top-1/2 hidden h-4 w-[3px] -translate-y-1/2 rounded-full bg-primary lg:block" />
                )}
                <it.icono className={cn('hidden size-[18px] shrink-0 lg:block', activo ? 'text-primary' : 'text-muted-foreground')} />
                <span className="min-w-0 flex-1 truncate text-left">{it.etiqueta}</span>
              </button>
            )
          })}
        </div>
      ))}
    </nav>
  )

  return (
    <>
      {/* Cabecera: la flecha devuelve al tablero (o sale del módulo si ya estás
          en él) y la ruta, en pequeño, dice dónde estás. El título grande vive
          dentro del panel, que es donde da jerarquía. */}
      <div className="mb-3 flex items-center gap-2">
        <Button
          size="icon"
          variant="ghost"
          className="size-8 shrink-0 text-muted-foreground"
          aria-label={tab === 'tablero' ? 'Salir de SST' : 'Volver al tablero de SST'}
          onClick={() => (tab === 'tablero' ? router.push('/') : irA('tablero'))}
        >
          <ChevronLeft className="size-[18px]" />
        </Button>
        <nav aria-label="Ruta" className="flex min-w-0 items-center gap-1.5 text-[13.5px] font-semibold">
          <span className="truncate">Seguridad y Salud en el Trabajo</span>
          {tab !== 'tablero' && (
            <>
              <span className="font-normal text-muted-foreground">›</span>
              <span className="truncate font-medium text-muted-foreground">{TITULO_TAB[tab] ?? 'SST'}</span>
            </>
          )}
        </nav>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[236px_minmax(0,1fr)]">
      {riel}

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{TITULO_TAB[tab] ?? 'Tablero'}</h1>
          {p.puedeCrear && !['tablero', 'emergencias', 'estructura', 'indicadores', 'autoeval'].includes(tab) && <Button size="sm" onClick={() => setDialogo(tab)}><Plus className="size-4" /> Nuevo</Button>}
          {p.puedeCrear && tab === 'autoeval' && <Button size="sm" onClick={() => setDialogo('autoeval')}><Plus className="size-4" /> Nuevo</Button>}
        </div>

      {tab === 'tablero' && (
        <div className="space-y-5">
          <div className="grid items-start gap-3 lg:grid-cols-2">
            {/* Semáforo de cumplimiento documental del SG-SST */}
            <Card><CardContent className="p-0">
              <div className="flex items-center justify-between px-3 pt-3 pb-1">
                <p className="text-sm font-medium">Cumplimiento documental</p>
                <Pill tone={p.semaforo.every((s) => s.estado === 'ok') ? 'ok' : p.semaforo.some((s) => s.estado === 'bad') ? 'bad' : 'warn'}>
                  {p.semaforo.filter((s) => s.estado === 'ok').length} de {p.semaforo.length} al día
                </Pill>
              </div>
              <div className="divide-y">
                {p.semaforo.map((s) => (
                  <button key={s.label} type="button" onClick={() => irA(s.tab)} className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
                    {s.estado === 'ok' ? <CircleCheck className="size-5 shrink-0 text-emerald-600" />
                      : s.estado === 'warn' ? <CircleAlert className="size-5 shrink-0 text-amber-500" />
                      : <CircleX className="size-5 shrink-0 text-destructive" />}
                    <div className="min-w-0 flex-1"><p className="text-sm font-medium">{s.label}</p><p className="text-xs text-muted-foreground">{s.detalle}</p></div>
                    <Pill tone={s.estado === 'ok' ? 'ok' : s.estado === 'warn' ? 'warn' : 'bad'}>{s.estado === 'ok' ? 'Al día' : s.estado === 'warn' ? 'Atención' : 'Falta'}</Pill>
                  </button>
                ))}
              </div>
            </CardContent></Card>

            {/* Contadores + accidentalidad */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Stat icono={Users} color="sky" valor={p.headcount} label="Trabajadores activos" />
                <Stat icono={FileWarning} color="rose" valor={furatPendientes} label="FURAT pendientes" onClick={() => irA('accidentes')} className={furatPendientes > 0 ? 'border-destructive/40 bg-destructive/5' : undefined} />
                <Stat icono={Stethoscope} color="rose" valor={examenesVencidos} label="Exámenes vencidos" onClick={() => irA('examenes')} />
                <Stat icono={HardHat} color="amber" valor={eppSinFirma} label="EPP sin firma" onClick={() => irA('epp')} />
              </div>
              <button type="button" onClick={() => irA('indicadores')} className="block w-full text-left">
                <Card className="transition-colors hover:bg-accent/40"><CardContent className="py-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-medium">Accidentalidad y ausentismo</p>
                    {p.indicadores.length > 0
                      ? <p className="text-xs text-muted-foreground">{MES[p.indicadores[0].mes]} {p.indicadores[0].anio} · IF {p.indicadores[0].frecuencia} · IS {p.indicadores[0].severidad} · aus. {p.indicadores[0].ausentismo}%</p>
                      : <p className="text-xs text-muted-foreground">Sin meses registrados</p>}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{p.indicadores.length} mes{p.indicadores.length === 1 ? '' : 'es'} registrado{p.indicadores.length === 1 ? '' : 's'} · índices de frecuencia, severidad y ausentismo</p>
                </CardContent></Card>
              </button>
            </div>
          </div>

          {/* Navegación por secciones */}
          {SECCIONES.map((sec) => (
            <div key={sec.titulo}>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{sec.titulo}</p>
              <div className="grid gap-3 sm:grid-cols-3">
                {sec.tiles.map((t) => (
                  <button key={t.tab} type="button" onClick={() => irA(t.tab)} className="text-left">
                    <Card className="h-full transition-colors hover:bg-accent/40"><CardContent className="flex items-center gap-3 py-3">
                      <Chip icono={t.icono} color={t.color} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{t.titulo}</p>
                        <p className="truncate text-xs text-muted-foreground">{t.desc}</p>
                      </div>
                      {t.pill}
                    </CardContent></Card>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'indicadores' && (
        <div className="space-y-3">
          <Card><CardContent className="py-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Semáforo de accidentalidad y ausentismo</p>
              {p.puedeCrear && <Button size="sm" variant="outline" onClick={() => setIndicadorAbierto(true)}><Plus className="size-4" /> Registrar mes</Button>}
            </div>
            {p.indicadores.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin indicadores mensuales registrados. Frecuencia, severidad y ausentismo se calculan a partir de trabajadores/horas-hombre que digita RRHH cada mes (los accidentes y días perdidos se toman automáticamente de lo reportado en Accidentes).</p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  {(['frecuencia', 'severidad', 'ausentismo'] as const).map((k) => {
                    const ult = p.indicadores[0]
                    const color = ult.tono === 'destructive' ? 'text-destructive' : ult.tono === 'amber' ? 'text-amber-500' : 'text-emerald-600'
                    const label = k === 'frecuencia' ? 'Índice de frecuencia' : k === 'severidad' ? 'Índice de severidad' : 'Ausentismo'
                    return (
                      <div key={k} className="rounded-md border p-3 text-center">
                        <p className={`text-2xl font-semibold tabular-nums ${color}`}>{ult[k]}{k === 'ausentismo' ? '%' : ''}</p>
                        <p className="text-xs text-muted-foreground">{label}</p>
                      </div>
                    )
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  {MES[p.indicadores[0].mes]} {p.indicadores[0].anio} · {p.indicadores[0].numAccidentes} accidente{p.indicadores[0].numAccidentes === 1 ? '' : 's'}, {p.indicadores[0].diasPerdidos} días perdidos, {p.indicadores[0].diasAusentismo} días de ausentismo sobre {p.indicadores[0].numTrabajadores} trabajadores.
                  Bandas de referencia internas (no un umbral legal único): verde = sin accidentalidad/ausentismo relevante, ámbar = frecuencia/severidad/ausentismo moderados, rojo = IF&gt;20, IS&gt;200 o ausentismo&gt;5%.
                </p>
                {p.indicadores.length > 1 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="text-muted-foreground"><th className="text-left font-normal">Mes</th><th className="font-normal">IF</th><th className="font-normal">IS</th><th className="font-normal">Ausent.%</th></tr></thead>
                      <tbody>{p.indicadores.map((i) => (
                        <tr key={`${i.anio}-${i.mes}`} className="border-t"><td className="py-1">{MES[i.mes]} {i.anio}</td><td className="text-center">{i.frecuencia}</td><td className="text-center">{i.severidad}</td><td className="text-center">{i.ausentismo}</td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </CardContent></Card>
        </div>
      )}

      {tab === 'estructura' && (
        <EstructuraSgsst estructura={p.estructura} puedeEditar={p.puedeEditar} />
      )}

      {tab === 'matriz' && (p.normas.length === 0 ? <Vacio /> : (
        <Card><CardContent className="p-0 divide-y">{p.normas.map((n) => (
          <button key={n.id} type="button" onClick={() => setNormaAbierta(n)} className="flex w-full items-center gap-3 p-3 text-left hover:bg-accent/40">
            <Chip icono={Scale} color="violet" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{n.norma}</p>
              <p className="truncate text-xs text-muted-foreground">{n.tema}</p>
            </div>
            {n.evidenciaDocId && <Paperclip className="size-4 shrink-0 text-muted-foreground" />}
            <Pill tone={TONO_CUMPLIMIENTO[n.cumplimiento] ?? 'muted'}>{CUMPLIMIENTO[n.cumplimiento] ?? n.cumplimiento}</Pill>
          </button>
        ))}</CardContent></Card>
      ))}

      {tab === 'examenes' && (p.examenes.length === 0 ? <Vacio /> : (
        <Card><CardContent className="p-0 divide-y">{p.examenes.map((e) => (
          <div key={e.id} className="flex items-center gap-3 p-3">
            <Chip icono={Stethoscope} color="rose" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">
                <Link href={`/colaboradores/${e.colaboradorId}`} className="hover:underline">{e.colaborador}</Link>
              </p>
              <p className="text-xs text-muted-foreground">
                {e.tipo} · {formatFechaCorta(new Date(e.fecha))}
                {e.vencimiento && (
                  <span className={e.vencido ? 'font-medium text-destructive' : ''}>
                    {' '}· {e.vencido ? 'venció' : 'vence'} {formatFechaCorta(new Date(e.vencimiento))}
                  </span>
                )}
              </p>
            </div>
            {e.tieneRestricciones && (
              <span title="Tiene restricciones médicas registradas (detalle solo con permiso de salud)">
                <OctagonAlert className="size-4 shrink-0 text-amber-500" />
              </span>
            )}
            {e.documentoId && p.verSalud && (
              <a href={`/api/documentos/${e.documentoId}`} target="_blank" rel="noreferrer" className="shrink-0 text-muted-foreground hover:text-primary" title="Ver certificado (dato de salud)">
                <Paperclip className="size-4" />
              </a>
            )}
            {e.vencido && <Pill tone="bad">Vencido</Pill>}
            <Pill tone={TONO_CONCEPTO[e.concepto] ?? 'muted'}>{CONCEPTO[e.concepto]}</Pill>
            {p.verSalud && (e.recomendaciones || e.restricciones) && (
              <button type="button" onClick={() => setExamenAbierto(e)} className="shrink-0">
                <Pill tone={e.seguimientoCerrado ? 'ok' : 'warn'}>{e.seguimientoCerrado ? 'Seguimiento cerrado' : `Seguimiento (${e.seguimientos.length})`}</Pill>
              </button>
            )}
          </div>
        ))}</CardContent></Card>
      ))}

      {tab === 'arl' && (p.novedadesArl.length === 0 ? <Vacio /> : (
        <Card><CardContent className="p-0 divide-y">{p.novedadesArl.map((n) => (
          <div key={n.id} className="flex items-center gap-3 p-3">
            <Chip icono={ShieldAlert} color="emerald" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{n.colaborador}</p>
              <p className="text-xs text-muted-foreground">
                {formatFechaCorta(new Date(n.fecha))}
                {n.claseRiesgo ? ` · clase de riesgo ${n.claseRiesgo}` : ''}
                {n.detalle ? ` · ${n.detalle}` : ''}
              </p>
            </div>
            {n.soporteDocId && (
              <a href={`/api/documentos/${n.soporteDocId}`} target="_blank" rel="noreferrer" className="shrink-0 text-muted-foreground hover:text-primary" title="Ver soporte">
                <Paperclip className="size-4" />
              </a>
            )}
            <Pill tone="info">{TIPO_NOVEDAD_ARL[n.tipo] ?? n.tipo}</Pill>
          </div>
        ))}</CardContent></Card>
      ))}

      {tab === 'accidentes' && (p.accidentes.length === 0 ? <Vacio /> : (
        <Card><CardContent className="p-0 divide-y">{p.accidentes.map((a) => (
          <button key={a.id} type="button" onClick={() => setAccidenteAbierto(a)} className="flex w-full items-center gap-3 p-3 text-left hover:bg-accent/40">
            <Chip icono={TriangleAlert} color={a.esIncidente ? 'sky' : 'amber'} />
            <div className="flex-1 min-w-0"><p className="font-medium text-sm truncate">{a.colaborador}</p><p className="text-xs text-muted-foreground">{formatFechaCorta(new Date(a.fecha))} · {a.descripcion}</p></div>
            {a.documentos.length > 0 && <Paperclip className="size-4 shrink-0 text-muted-foreground" />}
            {a.esIncidente && <Pill tone="info">Incidente</Pill>}
            {!a.furat && !a.esIncidente && <Pill tone="bad">FURAT pendiente</Pill>}
            <Pill tone={TONO_ESTADO_ACCIDENTE[a.estado] ?? 'muted'}>{ESTADO_ACCIDENTE[a.estado] ?? a.estado}</Pill>
          </button>
        ))}</CardContent></Card>
      ))}

      {tab === 'comites' && (p.comites.length === 0 ? <Vacio /> : (
        <Card><CardContent className="p-0 divide-y">{p.comites.map((c) => (
          <button key={c.id} type="button" onClick={() => setComiteAbierto(c)} className="flex w-full items-center gap-3 p-3 text-left hover:bg-accent/40">
            <Chip icono={Users} color="teal" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{TIPO_COMITE[c.tipo]}</p>
              <p className="text-xs text-muted-foreground">{c.miembros.length} miembro{c.miembros.length === 1 ? '' : 's'} · {c.reuniones.length} reunión{c.reuniones.length === 1 ? '' : 'es'}</p>
            </div>
            <span className="text-xs text-muted-foreground">vigente hasta {formatFechaCorta(new Date(c.vigenciaHasta))}</span>
          </button>
        ))}</CardContent></Card>
      ))}

      {tab === 'epp' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">{p.epps.map((e) => <Badge key={e.id} variant="outline">{e.nombre}</Badge>)}</div>
          {p.entregasEpp.length === 0 ? <Vacio /> : (
            <Card><CardContent className="p-0 divide-y">{p.entregasEpp.map((e) => (
              <div key={e.id} className="flex items-center gap-3 p-3">
                <Chip icono={HardHat} color="indigo" />
                <div className="min-w-0 flex-1"><p className="text-sm font-medium">{e.colaborador}</p><p className="text-xs text-muted-foreground">{e.cantidad}× {e.elemento} · {formatFechaCorta(new Date(e.fecha))}</p></div>
                {e.soporteDocId && (
                  <a href={`/api/documentos/${e.soporteDocId}`} target="_blank" rel="noreferrer" className="whitespace-nowrap text-xs text-primary hover:underline">Recibido</a>
                )}
                <Pill tone={e.firmado ? 'ok' : 'warn'}>{e.firmado ? 'Firmado' : 'Pendiente de firma'}</Pill>
              </div>
            ))}</CardContent></Card>
          )}
        </div>
      )}

      {tab === 'ipevr' && (p.peligros.length === 0 ? <Vacio /> : (
        <Card><CardContent className="p-0 divide-y">{p.peligros.map((pe) => (
          <div key={pe.id} className="flex items-start gap-3 p-3">
            <Chip icono={ShieldAlert} color="rose" />
            <div className="flex-1 min-w-0 space-y-0.5">
              <p className="font-medium text-sm">{pe.peligro} <span className="font-normal text-muted-foreground">— {pe.riesgo}</span></p>
              <p className="text-xs text-muted-foreground">
                {pe.proceso}{pe.sede ? ` · ${pe.sede}` : ''} · {pe.rutinaria ? 'Rutinaria' : 'No rutinaria'}
                {pe.responsable ? ` · Responsable: ${pe.responsable}` : ''}
                {pe.fechaRevision ? ` · revisado ${formatFechaCorta(new Date(pe.fechaRevision))}` : ''}
              </p>
              {(pe.controlFuente || pe.controlMedio || pe.controlIndividuo) && (
                <p className="text-xs text-muted-foreground">
                  Controles: {[pe.controlFuente && `fuente: ${pe.controlFuente}`, pe.controlMedio && `medio: ${pe.controlMedio}`, pe.controlIndividuo && `individuo: ${pe.controlIndividuo}`].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
            <Pill tone={TONO_NIVEL[pe.nivel] ?? 'muted'}>{NIVEL[pe.nivel]}</Pill>
          </div>
        ))}</CardContent></Card>
      ))}

      {tab === 'profesiograma' && (p.profesiogramas.length === 0 ? <Vacio /> : (
        <Card><CardContent className="p-0 divide-y">{p.profesiogramas.map((pr) => (
          <div key={pr.id} className="space-y-1 p-3">
            <div className="flex items-center gap-3"><Chip icono={IdCard} color="indigo" /><p className="text-sm font-medium">{pr.cargo}</p></div>
            <p className="pl-11 text-xs text-muted-foreground"><b>Riesgos:</b> {pr.riesgosExpuestos}</p>
            <p className="pl-11 text-xs text-muted-foreground"><b>Exámenes requeridos:</b> {pr.examenesRequeridos}</p>
            <p className="pl-11 text-xs text-muted-foreground"><b>Aptitudes:</b> {pr.aptitudesRequeridas}</p>
            {pr.restricciones && <p className="pl-11 text-xs text-muted-foreground"><b>Restricciones típicas:</b> {pr.restricciones}</p>}
          </div>
        ))}</CardContent></Card>
      ))}

      {tab === 'emergencias' && (
        <div className="space-y-6">
          <SeccionEmergencia titulo="Plan de emergencias" puedeCrear={p.puedeCrear} sedes={p.sedes} planes={p.planesEmergencia} />
          <SeccionBrigadistas puedeCrear={p.puedeCrear} sedes={p.sedes} brigadistas={p.brigadistas} />
          <SeccionSimulacros puedeCrear={p.puedeCrear} sedes={p.sedes} simulacros={p.simulacros} />
        </div>
      )}

      {tab === 'inspecciones' && (p.inspecciones.length === 0 ? <Vacio /> : (
        <Card><CardContent className="p-0 divide-y">{p.inspecciones.map((i) => (
          <button key={i.id} type="button" onClick={() => setInspeccionAbierta(i)} className="flex w-full items-center gap-3 p-3 text-left hover:bg-accent/40">
            <Chip icono={ClipboardCheck} color="teal" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{i.tipo}{i.area ? ` — ${i.area}` : ''}</p>
              <p className="text-xs text-muted-foreground">{formatFechaCorta(new Date(i.fecha))}{i.sede ? ` · ${i.sede}` : ''} · {i.hallazgos}</p>
            </div>
            {i.documentoId && <Paperclip className="size-4 shrink-0 text-muted-foreground" />}
            <Pill tone={i.estado === 'CERRADA' ? 'ok' : 'warn'}>{i.estado === 'CERRADA' ? 'Cerrada' : 'Abierta'}</Pill>
          </button>
        ))}</CardContent></Card>
      ))}

      {tab === 'autoeval' && (
        <PanelAutoeval autoeval={p.autoeval} puedeEditar={p.puedeEditar} />
      )}

      {dialogo === 'examenes' && <DialogExamen verSalud={p.verSalud} onClose={() => setDialogo(null)} />}
      {dialogo === 'accidentes' && <DialogAccidente onClose={() => setDialogo(null)} />}
      {accidenteAbierto && <DialogSeguimientoAccidente accidente={accidenteAbierto} onClose={() => setAccidenteAbierto(null)} />}
      {comiteAbierto && <DialogComiteDetalle comite={comiteAbierto} onClose={() => setComiteAbierto(null)} />}
      {dialogo === 'comites' && <DialogComite onClose={() => setDialogo(null)} />}
      {dialogo === 'epp' && <DialogEpp epps={p.epps} onClose={() => setDialogo(null)} />}
      {dialogo === 'ipevr' && <DialogPeligro sedes={p.sedes} onClose={() => setDialogo(null)} />}
      {dialogo === 'profesiograma' && <DialogProfesiograma cargos={p.cargos} onClose={() => setDialogo(null)} />}
      {dialogo === 'inspecciones' && <DialogInspeccion sedes={p.sedes} onClose={() => setDialogo(null)} />}
      {inspeccionAbierta && <DialogSeguimientoInspeccion inspeccion={inspeccionAbierta} onClose={() => setInspeccionAbierta(null)} />}
      {dialogo === 'autoeval' && <DialogAutoeval onClose={() => setDialogo(null)} />}
      {dialogo === 'matriz' && <DialogNorma onClose={() => setDialogo(null)} />}
      {dialogo === 'arl' && <DialogNovedadArl onClose={() => setDialogo(null)} />}
      {examenAbierto && <DialogSeguimientoRecomendaciones examen={examenAbierto} onClose={() => setExamenAbierto(null)} />}
      {normaAbierta && <DialogNorma norma={normaAbierta} puedeEditar={p.puedeEditar} onClose={() => setNormaAbierta(null)} />}
      {indicadorAbierto && <DialogIndicadorSst onClose={() => setIndicadorAbierto(false)} />}
      </div>
      </div>
    </>
  )
}

function Vacio() { return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Sin registros.</CardContent></Card> }
function Campo({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div> }

function DialogExamen({ verSalud, onClose }: { verSalud: boolean; onClose: () => void }) {
  const router = useRouter(); const [colaboradorId, setColaboradorId] = useState(''); const [f, setF] = useState<Record<string, string>>({ tipo: 'PERIODICO', concepto: 'APTO', fecha: new Date().toISOString().slice(0, 10) }); const [archivo, setArchivo] = useState<File | null>(null); const [g, setG] = useState(false)
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))
  async function guardar() {
    if (!colaboradorId) { toast.error('Selecciona un colaborador.'); return }
    setG(true)
    const res = await crearExamenMedico({ colaboradorId, tipo: f.tipo as 'PERIODICO', fecha: f.fecha, fechaVencimiento: f.fechaVencimiento, concepto: f.concepto as 'APTO', recomendaciones: f.recomendaciones, restricciones: f.restricciones })
    if (!res.ok) { setG(false); toast.error(res.error); return }
    const examenId = (res.datos as { id: string }).id
    if (archivo) {
      try {
        const fd = new FormData()
        fd.append('archivo', archivo)
        fd.append('entidadTipo', 'ExamenMedico')
        fd.append('entidadId', examenId)
        fd.append('nombre', `Certificado examen ${f.tipo.toLowerCase()}`)
        const up = await fetch('/api/documentos/subir', { method: 'POST', body: fd })
        if (up.ok) {
          const { id: documentoId } = await up.json()
          await vincularSoporteExamen({ examenId, documentoId })
        } else {
          toast.warning('El examen se registró, pero el certificado no se pudo adjuntar.')
        }
      } catch { toast.warning('El examen se registró, pero el certificado no se pudo adjuntar.') }
    }
    setG(false); toast.success('Examen registrado.'); onClose(); router.refresh()
  }
  return (<Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>Registrar examen médico</DialogTitle></DialogHeader>
    <div className="space-y-4">
      <Campo label="Colaborador"><SelectorColaborador value={colaboradorId} onChange={(id) => setColaboradorId(id)} /></Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Tipo"><Select value={f.tipo} onValueChange={(v) => set('tipo', v)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="INGRESO">Ingreso</SelectItem><SelectItem value="PERIODICO">Periódico</SelectItem><SelectItem value="EGRESO">Egreso</SelectItem><SelectItem value="POST_INCAPACIDAD">Post incapacidad</SelectItem></SelectContent></Select></Campo>
        <Campo label="Concepto"><Select value={f.concepto} onValueChange={(v) => set('concepto', v)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(CONCEPTO).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select></Campo>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Fecha"><Input type="date" value={f.fecha} onChange={(e) => set('fecha', e.target.value)} /></Campo>
        <Campo label="Próximo examen (vence)"><Input type="date" onChange={(e) => set('fechaVencimiento', e.target.value)} /></Campo>
      </div>
      {verSalud && <><Campo label="Recomendaciones (sensible)"><Textarea rows={2} onChange={(e) => set('recomendaciones', e.target.value)} /></Campo><Campo label="Restricciones (sensible)"><Textarea rows={2} onChange={(e) => set('restricciones', e.target.value)} /></Campo></>}
      <Campo label="Certificado del examen (opcional)">
        <input type="file" accept="image/*,application/pdf" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground" />
        <p className="text-xs text-muted-foreground">Acceso restringido (dato de salud, Ley 1581): solo lo ve quien tiene permiso sobre datos de salud.</p>
      </Campo>
    </div>
    <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={guardar} disabled={g}>{g && <Spinner />}Registrar</Button></DialogFooter></DialogContent></Dialog>)
}

function DialogAccidente({ onClose }: { onClose: () => void }) {
  const router = useRouter(); const [colaboradorId, setColaboradorId] = useState(''); const [f, setF] = useState<Record<string, string>>({ fecha: new Date().toISOString().slice(0, 10) }); const [esIncidente, setEsIncidente] = useState(false); const [g, setG] = useState(false)
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))
  async function guardar() { if (!colaboradorId) { toast.error('Selecciona un colaborador.'); return } setG(true); const res = await reportarAccidente({ colaboradorId, fecha: f.fecha, descripcion: f.descripcion ?? '', parteCuerpo: f.parteCuerpo, diasIncapacidad: f.diasIncapacidad ? Number(f.diasIncapacidad) : undefined, esIncidente }); setG(false); if (res.ok) { toast.success(esIncidente ? 'Incidente reportado para investigación.' : 'Accidente reportado. Alerta FURAT generada.'); onClose(); router.refresh() } else toast.error(res.error) }
  return (<Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent><DialogHeader><DialogTitle>{esIncidente ? 'Reportar incidente de trabajo' : 'Reportar accidente de trabajo'}</DialogTitle></DialogHeader>
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={esIncidente} onCheckedChange={(v) => setEsIncidente(Boolean(v))} /> Es un incidente (casi-accidente, sin lesión)</label>
      {esIncidente && <p className="text-xs text-muted-foreground">Los incidentes se investigan igual que los accidentes (Res. 1401/2007), pero no se reportan a la ARL ni suman a los índices de accidentalidad.</p>}
      <Campo label="Colaborador"><SelectorColaborador value={colaboradorId} onChange={(id) => setColaboradorId(id)} /></Campo>
      <div className="grid grid-cols-2 gap-3"><Campo label="Fecha"><Input type="date" value={f.fecha} onChange={(e) => set('fecha', e.target.value)} /></Campo>{!esIncidente && <Campo label="Parte del cuerpo"><Input onChange={(e) => set('parteCuerpo', e.target.value)} /></Campo>}</div>
      <Campo label="Descripción"><Textarea rows={3} onChange={(e) => set('descripcion', e.target.value)} /></Campo>
      {!esIncidente && <Campo label="Días de incapacidad"><Input type="number" onChange={(e) => set('diasIncapacidad', e.target.value)} /></Campo>}
    </div>
    <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={guardar} disabled={g}>{g && <Spinner />}Reportar</Button></DialogFooter></DialogContent></Dialog>)
}

function DialogSeguimientoAccidente({ accidente, onClose }: { accidente: Props['accidentes'][number]; onClose: () => void }) {
  const router = useRouter()
  const [estado, setEstado] = useState(accidente.estado)
  const [investigacion, setInvestigacion] = useState(accidente.investigacion ?? '')
  const [furat, setFurat] = useState(accidente.furat)
  const [dias, setDias] = useState(accidente.diasIncapacidad != null ? String(accidente.diasIncapacidad) : '')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [g, setG] = useState(false)

  async function guardar() {
    setG(true)
    const res = await actualizarAccidente({
      id: accidente.id, estado: estado as 'REPORTADO', investigacion, furatReportado: furat,
      diasIncapacidad: dias ? Number(dias) : undefined,
    })
    if (!res.ok) { setG(false); toast.error(res.error); return }
    if (archivo) {
      try {
        const fd = new FormData()
        fd.append('archivo', archivo)
        fd.append('entidadTipo', 'AccidenteTrabajo')
        fd.append('entidadId', accidente.id)
        fd.append('nombre', archivo.name)
        const up = await fetch('/api/documentos/subir', { method: 'POST', body: fd })
        if (!up.ok) toast.warning('El seguimiento se guardó, pero el soporte no se pudo adjuntar.')
      } catch { toast.warning('El seguimiento se guardó, pero el soporte no se pudo adjuntar.') }
    }
    setG(false); toast.success('Seguimiento actualizado.'); onClose(); router.refresh()
  }

  return (<Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>Seguimiento del accidente</DialogTitle></DialogHeader>
    <div className="space-y-4">
      <div><p className="text-sm font-medium">{accidente.colaborador}</p><p className="text-xs text-muted-foreground">{formatFechaCorta(new Date(accidente.fecha))} · {accidente.descripcion}{accidente.parteCuerpo ? ` · ${accidente.parteCuerpo}` : ''}</p></div>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Estado"><Select value={estado} onValueChange={setEstado}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(ESTADO_ACCIDENTE).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select></Campo>
        <Campo label="Días de incapacidad"><Input type="number" value={dias} onChange={(e) => setDias(e.target.value)} /></Campo>
      </div>
      {!accidente.esIncidente && <label className="flex items-center gap-2 text-sm"><Checkbox checked={furat} onCheckedChange={(v) => setFurat(Boolean(v))} /> Reportado a la ARL (FURAT)</label>}
      {accidente.esIncidente && <p className="text-xs text-muted-foreground">Incidente sin lesión: no requiere reporte FURAT a la ARL.</p>}
      <Campo label="Notas de investigación"><Textarea rows={4} value={investigacion} onChange={(e) => setInvestigacion(e.target.value)} placeholder="Causas, medidas correctivas, seguimiento…" /></Campo>
      {accidente.documentos.length > 0 && (
        <div className="space-y-1">
          <Label>Soportes adjuntos</Label>
          <ul className="space-y-1">{accidente.documentos.map((d) => (
            <li key={d.id}><a href={`/api/documentos/${d.id}`} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">{d.nombre}</a></li>
          ))}</ul>
        </div>
      )}
      <Campo label="Adjuntar soporte (FURAT, informe de investigación, etc.)">
        <input type="file" accept="image/*,application/pdf" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground" />
      </Campo>
    </div>
    <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={guardar} disabled={g}>{g && <Spinner />}Guardar</Button></DialogFooter></DialogContent></Dialog>)
}

function DialogComite({ onClose }: { onClose: () => void }) {
  const router = useRouter(); const [tipo, setTipo] = useState('COPASST'); const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10)); const [g, setG] = useState(false)
  async function guardar() { setG(true); const res = await crearComite({ tipo: tipo as 'COPASST', fechaConformacion: fecha }); setG(false); if (res.ok) { toast.success('Comité conformado.'); onClose(); router.refresh() } else toast.error(res.error) }
  return (<Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent><DialogHeader><DialogTitle>Conformar comité</DialogTitle></DialogHeader>
    <div className="space-y-4">
      <Campo label="Tipo"><Select value={tipo} onValueChange={setTipo}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="VIGIA_SST">Vigía SST</SelectItem><SelectItem value="COPASST">COPASST</SelectItem><SelectItem value="CONVIVENCIA">Comité de Convivencia</SelectItem></SelectContent></Select></Campo>
      <Campo label="Fecha de conformación"><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Campo>
      <p className="text-xs text-muted-foreground">La renovación a 2 años se programará como alerta automática.</p>
    </div>
    <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={guardar} disabled={g}>{g && <Spinner />}Conformar</Button></DialogFooter></DialogContent></Dialog>)
}

function DialogComiteDetalle({ comite, onClose }: { comite: Props['comites'][number]; onClose: () => void }) {
  const router = useRouter()
  const [colaboradorId, setColaboradorId] = useState('')
  const [rol, setRol] = useState('')
  const [porEmpleador, setPorEmpleador] = useState(false)
  const [gMiembro, setGMiembro] = useState(false)

  const [fechaReunion, setFechaReunion] = useState(new Date().toISOString().slice(0, 10))
  const [temas, setTemas] = useState('')
  const [compromisos, setCompromisos] = useState('')
  const [actaArchivo, setActaArchivo] = useState<File | null>(null)
  const [gReunion, setGReunion] = useState(false)

  async function agregarMiembro() {
    if (!colaboradorId || !rol.trim()) { toast.error('Selecciona colaborador y rol.'); return }
    setGMiembro(true)
    const res = await agregarMiembroComite({ comiteId: comite.id, colaboradorId, rol: rol.trim(), porEmpleador })
    setGMiembro(false)
    if (res.ok) { setColaboradorId(''); setRol(''); setPorEmpleador(false); toast.success('Miembro agregado.'); router.refresh() } else toast.error(res.error)
  }

  async function quitarMiembro(id: string) {
    const res = await eliminarMiembroComite({ id })
    if (res.ok) { toast.success('Miembro eliminado.'); router.refresh() } else toast.error(res.error)
  }

  async function guardarReunion() {
    if (!temas.trim()) { toast.error('Describe los temas tratados.'); return }
    setGReunion(true)
    const res = await registrarReunionComite({ comiteId: comite.id, fecha: fechaReunion, temas: temas.trim(), compromisos: compromisos.trim() || undefined })
    if (!res.ok) { setGReunion(false); toast.error(res.error); return }
    const reunionId = (res.datos as { id: string }).id
    if (actaArchivo) {
      try {
        const fd = new FormData()
        fd.append('archivo', actaArchivo)
        fd.append('entidadTipo', 'ReunionComite')
        fd.append('entidadId', reunionId)
        fd.append('nombre', `Acta ${TIPO_COMITE[comite.tipo]} ${fechaReunion}`)
        const up = await fetch('/api/documentos/subir', { method: 'POST', body: fd })
        if (up.ok) {
          const { id: documentoId } = await up.json()
          await vincularActaReunion({ reunionId, documentoId })
        } else toast.warning('La reunión se registró, pero el acta no se pudo adjuntar.')
      } catch { toast.warning('La reunión se registró, pero el acta no se pudo adjuntar.') }
    }
    setGReunion(false); setTemas(''); setCompromisos(''); setActaArchivo(null)
    toast.success('Reunión registrada.'); router.refresh()
  }

  return (<Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{TIPO_COMITE[comite.tipo]}</DialogTitle></DialogHeader>
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-sm font-medium">Miembros</p>
        {comite.miembros.length > 0 && (
          <ul className="mb-3 space-y-1">{comite.miembros.map((m) => (
            <li key={m.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{m.colaborador} <span className="text-xs text-muted-foreground">— {m.rol} ({m.porEmpleador ? 'empleador' : 'trabajadores'})</span></span>
              <button type="button" onClick={() => quitarMiembro(m.id)} className="text-xs text-destructive hover:underline">Quitar</button>
            </li>
          ))}</ul>
        )}
        <div className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[2fr_1fr_auto_auto]">
          <SelectorColaborador value={colaboradorId} onChange={setColaboradorId} />
          <Input placeholder="Rol (Presidente, Secretario…)" value={rol} onChange={(e) => setRol(e.target.value)} />
          <label className="flex items-center gap-1.5 whitespace-nowrap text-xs"><Checkbox checked={porEmpleador} onCheckedChange={(v) => setPorEmpleador(Boolean(v))} /> Empleador</label>
          <Button size="sm" onClick={agregarMiembro} disabled={gMiembro}>{gMiembro && <Spinner />}Agregar</Button>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Reuniones y actas</p>
        {comite.reuniones.length > 0 && (
          <ul className="mb-3 space-y-2">{comite.reuniones.map((r) => (
            <li key={r.id} className="rounded-md border p-2 text-sm">
              <p className="font-medium">{formatFechaCorta(new Date(r.fecha))}</p>
              <p className="text-xs text-muted-foreground">{r.temas}</p>
              {r.compromisos && <p className="text-xs text-muted-foreground">Compromisos: {r.compromisos}</p>}
              {r.actaDocId ? (
                <a href={`/api/documentos/${r.actaDocId}`} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">Ver acta</a>
              ) : <p className="text-xs text-amber-600">Sin acta adjunta</p>}
            </li>
          ))}</ul>
        )}
        <div className="space-y-2 rounded-md border p-3">
          <div className="grid grid-cols-2 gap-2"><Input type="date" value={fechaReunion} onChange={(e) => setFechaReunion(e.target.value)} /></div>
          <Textarea rows={2} placeholder="Temas tratados" value={temas} onChange={(e) => setTemas(e.target.value)} />
          <Textarea rows={2} placeholder="Compromisos (opcional)" value={compromisos} onChange={(e) => setCompromisos(e.target.value)} />
          <input type="file" accept="image/*,application/pdf" onChange={(e) => setActaArchivo(e.target.files?.[0] ?? null)} className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground" />
          <Button size="sm" onClick={guardarReunion} disabled={gReunion}>{gReunion && <Spinner />}Registrar reunión</Button>
        </div>
      </div>
    </div>
    <DialogFooter><Button variant="ghost" onClick={onClose}>Cerrar</Button></DialogFooter></DialogContent></Dialog>)
}

function DialogEpp({ epps, onClose }: { epps: { id: string; nombre: string }[]; onClose: () => void }) {
  const router = useRouter(); const [colaboradorId, setColaboradorId] = useState(''); const [elementoEppId, setElementoEppId] = useState(''); const [nuevoEpp, setNuevoEpp] = useState(''); const [cantidad, setCantidad] = useState('1'); const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10)); const [reposicion, setReposicion] = useState(false); const [g, setG] = useState(false)
  async function guardar() {
    setG(true)
    if (nuevoEpp.trim()) { await crearEpp({ nombre: nuevoEpp.trim() }); toast.success('EPP creado. Vuelve a seleccionarlo.'); setG(false); router.refresh(); return }
    if (!colaboradorId || !elementoEppId) { toast.error('Selecciona colaborador y EPP.'); setG(false); return }
    const res = await entregarEpp({ elementoEppId, colaboradorId, cantidad: Number(cantidad), fechaEntrega: fecha, reposicion }); setG(false)
    if (res.ok) { toast.success('Entrega registrada.'); onClose(); router.refresh() } else toast.error(res.error)
  }
  return (<Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent><DialogHeader><DialogTitle>Entregar EPP</DialogTitle></DialogHeader>
    <div className="space-y-4">
      <Campo label="Nuevo elemento (opcional)"><Input value={nuevoEpp} onChange={(e) => setNuevoEpp(e.target.value)} placeholder="Crear nuevo EPP…" /></Campo>
      {!nuevoEpp && <>
        <Campo label="Colaborador"><SelectorColaborador value={colaboradorId} onChange={(id) => setColaboradorId(id)} /></Campo>
        <Campo label="Elemento"><Select value={elementoEppId} onValueChange={setElementoEppId}><SelectTrigger className="w-full"><SelectValue placeholder="Selecciona…" /></SelectTrigger><SelectContent>{epps.map((e) => <SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>)}</SelectContent></Select></Campo>
        <div className="grid grid-cols-2 gap-3"><Campo label="Cantidad"><Input type="number" value={cantidad} onChange={(e) => setCantidad(e.target.value)} /></Campo><Campo label="Fecha"><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Campo></div>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={reposicion} onCheckedChange={(v) => setReposicion(Boolean(v))} /> Es reposición</label>
      </>}
    </div>
    <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={guardar} disabled={g}>{g && <Spinner />}{nuevoEpp ? 'Crear EPP' : 'Entregar'}</Button></DialogFooter></DialogContent></Dialog>)
}

function DialogPeligro({ sedes, onClose }: { sedes: { id: string; nombre: string }[]; onClose: () => void }) {
  const router = useRouter(); const [f, setF] = useState<Record<string, string>>({ nivel: 'MEDIO' }); const [rutinaria, setRutinaria] = useState(true); const [g, setG] = useState(false)
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))
  async function guardar() {
    setG(true)
    const res = await crearPeligro({
      proceso: f.proceso ?? '', peligro: f.peligro ?? '', riesgo: f.riesgo ?? '', nivel: f.nivel as 'MEDIO', controles: f.controles,
      sedeId: f.sedeId, rutinaria, controlFuente: f.controlFuente, controlMedio: f.controlMedio, controlIndividuo: f.controlIndividuo,
      responsable: f.responsable, fechaRevision: f.fechaRevision,
    })
    setG(false); if (res.ok) { toast.success('Peligro registrado.'); onClose(); router.refresh() } else toast.error(res.error)
  }
  return (<Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>Registrar peligro (matriz IPEVR — GTC 45)</DialogTitle></DialogHeader>
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Proceso"><Input onChange={(e) => set('proceso', e.target.value)} /></Campo>
        <Campo label="Sede"><Select value={f.sedeId ?? ''} onValueChange={(v) => set('sedeId', v)}><SelectTrigger className="w-full"><SelectValue placeholder="Todas" /></SelectTrigger><SelectContent>{sedes.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}</SelectContent></Select></Campo>
      </div>
      <Campo label="Peligro"><Input onChange={(e) => set('peligro', e.target.value)} /></Campo>
      <Campo label="Riesgo"><Input onChange={(e) => set('riesgo', e.target.value)} /></Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Nivel"><Select value={f.nivel} onValueChange={(v) => set('nivel', v)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(NIVEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select></Campo>
        <label className="flex items-center gap-2 self-end text-sm pb-2"><Checkbox checked={rutinaria} onCheckedChange={(v) => setRutinaria(Boolean(v))} /> Tarea rutinaria</label>
      </div>
      <Campo label="Controles existentes (resumen)"><Textarea rows={2} onChange={(e) => set('controles', e.target.value)} /></Campo>
      <div className="grid grid-cols-3 gap-2">
        <Campo label="Control en la fuente"><Input onChange={(e) => set('controlFuente', e.target.value)} /></Campo>
        <Campo label="Control en el medio"><Input onChange={(e) => set('controlMedio', e.target.value)} /></Campo>
        <Campo label="Control en el individuo (EPP)"><Input onChange={(e) => set('controlIndividuo', e.target.value)} /></Campo>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Responsable"><Input onChange={(e) => set('responsable', e.target.value)} /></Campo>
        <Campo label="Fecha de revisión"><Input type="date" onChange={(e) => set('fechaRevision', e.target.value)} /></Campo>
      </div>
    </div>
    <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={guardar} disabled={g}>{g && <Spinner />}Registrar</Button></DialogFooter></DialogContent></Dialog>)
}

function DialogProfesiograma({ cargos, onClose }: { cargos: { id: string; nombre: string }[]; onClose: () => void }) {
  const router = useRouter(); const [cargoId, setCargoId] = useState(''); const [f, setF] = useState<Record<string, string>>({}); const [g, setG] = useState(false)
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))
  async function guardar() {
    if (!cargoId || !f.riesgosExpuestos?.trim() || !f.examenesRequeridos?.trim() || !f.aptitudesRequeridas?.trim()) { toast.error('Completa el cargo, riesgos, exámenes y aptitudes.'); return }
    setG(true)
    const res = await guardarProfesiograma({ cargoId, riesgosExpuestos: f.riesgosExpuestos, examenesRequeridos: f.examenesRequeridos, aptitudesRequeridas: f.aptitudesRequeridas, restricciones: f.restricciones })
    setG(false); if (res.ok) { toast.success('Profesiograma guardado.'); onClose(); router.refresh() } else toast.error(res.error)
  }
  return (<Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>Profesiograma por cargo</DialogTitle></DialogHeader>
    <div className="space-y-4">
      <Campo label="Cargo"><Select value={cargoId} onValueChange={setCargoId}><SelectTrigger className="w-full"><SelectValue placeholder="Selecciona…" /></SelectTrigger><SelectContent>{cargos.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent></Select></Campo>
      <Campo label="Riesgos a los que está expuesto"><Textarea rows={2} value={f.riesgosExpuestos ?? ''} onChange={(e) => set('riesgosExpuestos', e.target.value)} /></Campo>
      <Campo label="Exámenes médicos ocupacionales requeridos"><Textarea rows={2} value={f.examenesRequeridos ?? ''} onChange={(e) => set('examenesRequeridos', e.target.value)} /></Campo>
      <Campo label="Aptitudes físicas/psicológicas requeridas"><Textarea rows={2} value={f.aptitudesRequeridas ?? ''} onChange={(e) => set('aptitudesRequeridas', e.target.value)} /></Campo>
      <Campo label="Restricciones típicas del cargo (opcional)"><Textarea rows={2} value={f.restricciones ?? ''} onChange={(e) => set('restricciones', e.target.value)} /></Campo>
      <p className="text-xs text-muted-foreground">Si el cargo ya tiene profesiograma, guardar lo actualiza.</p>
    </div>
    <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={guardar} disabled={g}>{g && <Spinner />}Guardar</Button></DialogFooter></DialogContent></Dialog>)
}

function DialogInspeccion({ sedes, onClose }: { sedes: { id: string; nombre: string }[]; onClose: () => void }) {
  const router = useRouter(); const [f, setF] = useState<Record<string, string>>({ tipo: 'Locativa', fecha: new Date().toISOString().slice(0, 10) }); const [g, setG] = useState(false)
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))
  async function guardar() {
    if (!f.hallazgos?.trim()) { toast.error('Describe los hallazgos.'); return }
    setG(true)
    const res = await registrarInspeccion({ sedeId: f.sedeId, fecha: f.fecha, tipo: f.tipo, area: f.area, hallazgos: f.hallazgos, responsable: f.responsable })
    setG(false); if (res.ok) { toast.success('Inspección registrada.'); onClose(); router.refresh() } else toast.error(res.error)
  }
  return (<Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent><DialogHeader><DialogTitle>Registrar inspección de seguridad</DialogTitle></DialogHeader>
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Tipo"><Input value={f.tipo} onChange={(e) => set('tipo', e.target.value)} placeholder="Locativa, extintores, equipos…" /></Campo>
        <Campo label="Sede"><Select value={f.sedeId ?? ''} onValueChange={(v) => set('sedeId', v)}><SelectTrigger className="w-full"><SelectValue placeholder="Todas" /></SelectTrigger><SelectContent>{sedes.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}</SelectContent></Select></Campo>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Fecha"><Input type="date" value={f.fecha} onChange={(e) => set('fecha', e.target.value)} /></Campo>
        <Campo label="Área"><Input onChange={(e) => set('area', e.target.value)} /></Campo>
      </div>
      <Campo label="Hallazgos"><Textarea rows={3} onChange={(e) => set('hallazgos', e.target.value)} /></Campo>
      <Campo label="Responsable"><Input onChange={(e) => set('responsable', e.target.value)} /></Campo>
    </div>
    <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={guardar} disabled={g}>{g && <Spinner />}Registrar</Button></DialogFooter></DialogContent></Dialog>)
}

function DialogSeguimientoInspeccion({ inspeccion, onClose }: { inspeccion: Props['inspecciones'][number]; onClose: () => void }) {
  const router = useRouter(); const [fechaCierre, setFechaCierre] = useState(new Date().toISOString().slice(0, 10)); const [archivo, setArchivo] = useState<File | null>(null); const [g, setG] = useState(false)

  async function adjuntar() {
    if (!archivo) return
    setG(true)
    try {
      const fd = new FormData()
      fd.append('archivo', archivo)
      fd.append('entidadTipo', 'InspeccionSst')
      fd.append('entidadId', inspeccion.id)
      fd.append('nombre', `Inspección ${inspeccion.tipo} ${inspeccion.fecha}`)
      const up = await fetch('/api/documentos/subir', { method: 'POST', body: fd })
      if (up.ok) { const { id: documentoId } = await up.json(); await vincularDocumentoInspeccion({ inspeccionId: inspeccion.id, documentoId }); toast.success('Soporte adjuntado.'); router.refresh() }
      else toast.error('No se pudo adjuntar el soporte.')
    } catch { toast.error('No se pudo adjuntar el soporte.') }
    setG(false)
  }

  async function cerrar() {
    setG(true)
    const res = await cerrarInspeccion({ id: inspeccion.id, fechaCierre })
    setG(false); if (res.ok) { toast.success('Inspección cerrada.'); onClose(); router.refresh() } else toast.error(res.error)
  }

  return (<Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>{inspeccion.tipo}{inspeccion.area ? ` — ${inspeccion.area}` : ''}</DialogTitle></DialogHeader>
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{formatFechaCorta(new Date(inspeccion.fecha))}{inspeccion.sede ? ` · ${inspeccion.sede}` : ''}{inspeccion.responsable ? ` · ${inspeccion.responsable}` : ''}</p>
      <div><Label>Hallazgos</Label><p className="mt-1 text-sm">{inspeccion.hallazgos}</p></div>
      {inspeccion.documentoId && <a href={`/api/documentos/${inspeccion.documentoId}`} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">Ver soporte adjunto</a>}
      {inspeccion.estado === 'ABIERTA' ? (
        <>
          <Campo label="Adjuntar soporte (fotos, checklist)">
            <div className="flex gap-2">
              <input type="file" accept="image/*,application/pdf" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground" />
              <Button size="sm" variant="outline" onClick={adjuntar} disabled={!archivo || g}>Subir</Button>
            </div>
          </Campo>
          <Campo label="Fecha de cierre (al resolver los hallazgos)"><Input type="date" value={fechaCierre} onChange={(e) => setFechaCierre(e.target.value)} /></Campo>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Cerrada el {inspeccion.fechaCierre ? formatFechaCorta(new Date(inspeccion.fechaCierre)) : '—'}.</p>
      )}
    </div>
    <DialogFooter>
      <Button variant="ghost" onClick={onClose}>Cerrar</Button>
      {inspeccion.estado === 'ABIERTA' && <Button onClick={cerrar} disabled={g}>{g && <Spinner />}Marcar como resuelta</Button>}
    </DialogFooter>
  </DialogContent></Dialog>)
}

function SeccionEmergencia({ titulo, puedeCrear, sedes, planes }: { titulo: string; puedeCrear: boolean; sedes: { id: string; nombre: string }[]; planes: Props['planesEmergencia'] }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [f, setF] = useState<Record<string, string>>({ version: '1', vigenciaDesde: new Date().toISOString().slice(0, 10) })
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))
  const [g, setG] = useState(false)

  async function crear() {
    if (!f.vigenciaHasta) { toast.error('Define la vigencia hasta.'); return }
    setG(true)
    const res = await crearPlanEmergencia({ sedeId: f.sedeId, version: f.version, vigenciaDesde: f.vigenciaDesde, vigenciaHasta: f.vigenciaHasta })
    if (!res.ok) { setG(false); toast.error(res.error); return }
    setG(false); toast.success('Plan de emergencias registrado.'); setAbierto(false); router.refresh()
  }

  async function adjuntar(planId: string, archivo: File) {
    const fd = new FormData()
    fd.append('archivo', archivo)
    fd.append('entidadTipo', 'PlanEmergencia')
    fd.append('entidadId', planId)
    fd.append('nombre', `Plan de emergencias`)
    const up = await fetch('/api/documentos/subir', { method: 'POST', body: fd })
    if (up.ok) { const { id: documentoId } = await up.json(); await vincularDocumentoPlanEmergencia({ planId, documentoId }); toast.success('Documento adjuntado.'); router.refresh() }
    else toast.error('No se pudo adjuntar.')
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between"><p className="text-sm font-medium">{titulo}</p>{puedeCrear && <Button size="sm" variant="outline" onClick={() => setAbierto((v) => !v)}><Plus className="size-4" /> Nuevo</Button>}</div>
      {planes.length === 0 ? <p className="text-xs text-muted-foreground">Sin plan de emergencias registrado.</p> : (
        <ul className="mb-3 space-y-2">{planes.map((pl) => (
          <li key={pl.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
            <Flame className="size-4 shrink-0 text-amber-500" />
            <div className="min-w-0 flex-1">
              <p>v{pl.version}{pl.sede ? ` · ${pl.sede}` : ''}</p>
              <p className={`text-xs ${pl.vencido ? 'font-medium text-destructive' : 'text-muted-foreground'}`}>{pl.vencido ? 'venció' : 'vigente hasta'} {formatFechaCorta(new Date(pl.vigenciaHasta))}</p>
            </div>
            {pl.documentoId ? (
              <a href={`/api/documentos/${pl.documentoId}`} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">Ver documento</a>
            ) : puedeCrear && <input type="file" accept="application/pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) adjuntar(pl.id, f) }} className="w-40 text-xs" />}
          </li>
        ))}</ul>
      )}
      {abierto && (
        <div className="space-y-2 rounded-md border p-3">
          <div className="grid grid-cols-3 gap-2">
            <Campo label="Versión"><Input value={f.version} onChange={(e) => set('version', e.target.value)} /></Campo>
            <Campo label="Sede"><Select value={f.sedeId ?? ''} onValueChange={(v) => set('sedeId', v)}><SelectTrigger className="w-full"><SelectValue placeholder="Todas" /></SelectTrigger><SelectContent>{sedes.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}</SelectContent></Select></Campo>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Campo label="Vigencia desde"><Input type="date" value={f.vigenciaDesde} onChange={(e) => set('vigenciaDesde', e.target.value)} /></Campo>
            <Campo label="Vigencia hasta"><Input type="date" onChange={(e) => set('vigenciaHasta', e.target.value)} /></Campo>
          </div>
          <Button size="sm" onClick={crear} disabled={g}>{g && <Spinner />}Registrar</Button>
        </div>
      )}
    </div>
  )
}

function SeccionBrigadistas({ puedeCrear, sedes, brigadistas }: { puedeCrear: boolean; sedes: { id: string; nombre: string }[]; brigadistas: Props['brigadistas'] }) {
  const router = useRouter()
  const [colaboradorId, setColaboradorId] = useState('')
  const [rol, setRol] = useState('')
  const [sedeId, setSedeId] = useState('')
  const [g, setG] = useState(false)

  async function agregar() {
    if (!colaboradorId || !rol.trim()) { toast.error('Selecciona colaborador y rol.'); return }
    setG(true)
    const res = await agregarBrigadista({ colaboradorId, sedeId, rol: rol.trim() })
    setG(false); if (res.ok) { setColaboradorId(''); setRol(''); toast.success('Brigadista agregado.'); router.refresh() } else toast.error(res.error)
  }
  async function quitar(id: string) {
    const res = await eliminarBrigadista({ id })
    if (res.ok) { toast.success('Brigadista eliminado.'); router.refresh() } else toast.error(res.error)
  }

  return (
    <div>
      <p className="mb-2 text-sm font-medium">Brigada de emergencias</p>
      {brigadistas.length === 0 ? <p className="mb-3 text-xs text-muted-foreground">Sin brigadistas asignados.</p> : (
        <ul className="mb-3 space-y-1">{brigadistas.map((b) => (
          <li key={b.id} className="flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{b.colaborador} <span className="text-xs text-muted-foreground">— {b.rol}{b.sede ? ` · ${b.sede}` : ''}</span></span>
            {puedeCrear && <button type="button" onClick={() => quitar(b.id)} className="text-xs text-destructive hover:underline">Quitar</button>}
          </li>
        ))}</ul>
      )}
      {puedeCrear && (
        <div className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
          <SelectorColaborador value={colaboradorId} onChange={setColaboradorId} />
          <Input placeholder="Rol (evacuación, primeros auxilios…)" value={rol} onChange={(e) => setRol(e.target.value)} />
          <Select value={sedeId} onValueChange={setSedeId}><SelectTrigger className="w-full"><SelectValue placeholder="Sede" /></SelectTrigger><SelectContent>{sedes.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}</SelectContent></Select>
          <Button size="sm" onClick={agregar} disabled={g}>{g && <Spinner />}Agregar</Button>
        </div>
      )}
    </div>
  )
}

function SeccionSimulacros({ puedeCrear, sedes, simulacros }: { puedeCrear: boolean; sedes: { id: string; nombre: string }[]; simulacros: Props['simulacros'] }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [f, setF] = useState<Record<string, string>>({ tipo: 'Evacuación', fecha: new Date().toISOString().slice(0, 10) })
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))
  const [archivo, setArchivo] = useState<File | null>(null)
  const [g, setG] = useState(false)

  async function registrar() {
    setG(true)
    const res = await registrarSimulacro({ sedeId: f.sedeId, fecha: f.fecha, tipo: f.tipo, participantes: f.participantes ? Number(f.participantes) : undefined, observaciones: f.observaciones })
    if (!res.ok) { setG(false); toast.error(res.error); return }
    const simulacroId = (res.datos as { id: string }).id
    if (archivo) {
      try {
        const fd = new FormData()
        fd.append('archivo', archivo)
        fd.append('entidadTipo', 'Simulacro')
        fd.append('entidadId', simulacroId)
        fd.append('nombre', `Acta simulacro ${f.tipo}`)
        const up = await fetch('/api/documentos/subir', { method: 'POST', body: fd })
        if (up.ok) { const { id: documentoId } = await up.json(); await vincularDocumentoSimulacro({ simulacroId, documentoId }) }
        else toast.warning('El simulacro se registró, pero el acta no se pudo adjuntar.')
      } catch { toast.warning('El simulacro se registró, pero el acta no se pudo adjuntar.') }
    }
    setG(false); toast.success('Simulacro registrado.'); setAbierto(false); router.refresh()
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between"><p className="text-sm font-medium">Simulacros</p>{puedeCrear && <Button size="sm" variant="outline" onClick={() => setAbierto((v) => !v)}><Plus className="size-4" /> Nuevo</Button>}</div>
      {simulacros.length === 0 ? <p className="mb-3 text-xs text-muted-foreground">Sin simulacros registrados.</p> : (
        <ul className="mb-3 space-y-1">{simulacros.map((s) => (
          <li key={s.id} className="flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{formatFechaCorta(new Date(s.fecha))} · {s.tipo}{s.sede ? ` · ${s.sede}` : ''}{s.participantes != null ? ` · ${s.participantes} participantes` : ''}</span>
            {s.documentoId && <a href={`/api/documentos/${s.documentoId}`} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">Acta</a>}
          </li>
        ))}</ul>
      )}
      {abierto && (
        <div className="space-y-2 rounded-md border p-3">
          <div className="grid grid-cols-3 gap-2">
            <Campo label="Tipo"><Input value={f.tipo} onChange={(e) => set('tipo', e.target.value)} /></Campo>
            <Campo label="Fecha"><Input type="date" value={f.fecha} onChange={(e) => set('fecha', e.target.value)} /></Campo>
            <Campo label="Sede"><Select value={f.sedeId ?? ''} onValueChange={(v) => set('sedeId', v)}><SelectTrigger className="w-full"><SelectValue placeholder="Todas" /></SelectTrigger><SelectContent>{sedes.map((sd) => <SelectItem key={sd.id} value={sd.id}>{sd.nombre}</SelectItem>)}</SelectContent></Select></Campo>
          </div>
          <Campo label="Participantes"><Input type="number" onChange={(e) => set('participantes', e.target.value)} /></Campo>
          <Campo label="Observaciones"><Textarea rows={2} onChange={(e) => set('observaciones', e.target.value)} /></Campo>
          <Campo label="Acta del simulacro (opcional)"><input type="file" accept="image/*,application/pdf" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground" /></Campo>
          <Button size="sm" onClick={registrar} disabled={g}>{g && <Spinner />}Registrar</Button>
        </div>
      )}
    </div>
  )
}

function DialogIndicadorSst({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const hoy = new Date()
  const [f, setF] = useState<Record<string, string>>({ anio: String(hoy.getFullYear()), mes: String(hoy.getMonth() + 1) })
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))
  const [g, setG] = useState(false)

  async function guardar() {
    if (!f.numTrabajadores || !f.horasHombre) { toast.error('Completa trabajadores y horas-hombre del periodo.'); return }
    setG(true)
    const res = await guardarIndicadorSst({
      anio: Number(f.anio), mes: Number(f.mes), numTrabajadores: Number(f.numTrabajadores),
      horasHombre: Number(f.horasHombre), diasAusentismo: Number(f.diasAusentismo || 0),
    })
    setG(false); if (res.ok) { toast.success('Indicador mensual guardado.'); onClose(); router.refresh() } else toast.error(res.error)
  }

  return (<Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent><DialogHeader><DialogTitle>Registrar indicador mensual</DialogTitle></DialogHeader>
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Año"><Input type="number" value={f.anio} onChange={(e) => set('anio', e.target.value)} /></Campo>
        <Campo label="Mes"><Select value={f.mes} onValueChange={(v) => set('mes', v)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <SelectItem key={m} value={String(m)}>{m}</SelectItem>)}</SelectContent></Select></Campo>
      </div>
      <Campo label="N.° de trabajadores del periodo"><Input type="number" onChange={(e) => set('numTrabajadores', e.target.value)} /></Campo>
      <Campo label="Horas-hombre trabajadas en el mes"><Input type="number" onChange={(e) => set('horasHombre', e.target.value)} /></Campo>
      <Campo label="Días de ausentismo (incapacidad + permisos no vacacionales)"><Input type="number" onChange={(e) => set('diasAusentismo', e.target.value)} /></Campo>
      <p className="text-xs text-muted-foreground">Los accidentes y días perdidos del mes se toman automáticamente de lo ya reportado en la pestaña Accidentes.</p>
    </div>
    <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={guardar} disabled={g}>{g && <Spinner />}Guardar</Button></DialogFooter></DialogContent></Dialog>)
}

function DialogAutoeval({ onClose }: { onClose: () => void }) {
  const router = useRouter(); const [f, setF] = useState<Record<string, string>>({ anio: String(new Date().getUTCFullYear()), nivelEstandar: '60' }); const [g, setG] = useState(false)
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))
  async function guardar() { setG(true); const res = await registrarAutoevaluacion({ anio: Number(f.anio), puntaje: Number(f.puntaje || 0), nivelEstandar: Number(f.nivelEstandar), planMejora: f.planMejora }); setG(false); if (res.ok) { toast.success('Autoevaluación registrada.'); onClose(); router.refresh() } else toast.error(res.error) }
  return (<Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent><DialogHeader><DialogTitle>Autoevaluación de estándares mínimos</DialogTitle></DialogHeader>
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Campo label="Año"><Input type="number" value={f.anio} onChange={(e) => set('anio', e.target.value)} /></Campo>
        <Campo label="Puntaje"><Input type="number" onChange={(e) => set('puntaje', e.target.value)} /></Campo>
        <Campo label="Estándares"><Select value={f.nivelEstandar} onValueChange={(v) => set('nivelEstandar', v)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="7">7</SelectItem><SelectItem value="21">21</SelectItem><SelectItem value="60">60</SelectItem></SelectContent></Select></Campo>
      </div>
      <Campo label="Plan de mejora"><Textarea rows={3} onChange={(e) => set('planMejora', e.target.value)} /></Campo>
    </div>
    <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={guardar} disabled={g}>{g && <Spinner />}Registrar</Button></DialogFooter></DialogContent></Dialog>)
}

// ── Estructura del SG-SST ───────────────────────────────────────────────────

async function subirDoc(archivo: File, entidadTipo: string, entidadId: string, nombre: string): Promise<string | null> {
  try {
    const fd = new FormData()
    fd.append('archivo', archivo)
    fd.append('entidadTipo', entidadTipo)
    fd.append('entidadId', entidadId)
    fd.append('nombre', nombre)
    const up = await fetch('/api/documentos/subir', { method: 'POST', body: fd })
    if (!up.ok) return null
    const { id } = await up.json()
    return id as string
  } catch { return null }
}

function EstructuraSgsst({ estructura, puedeEditar }: { estructura: Props['estructura']; puedeEditar: boolean }) {
  const [dialogo, setDialogo] = useState<'politica' | 'responsable' | 'plan' | null>(null)
  const e = estructura
  return (
    <div className="space-y-3">
      <Card><CardContent className="flex flex-wrap items-center gap-3 py-4">
        <Chip icono={Landmark} color="sky" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Política del SG-SST</p>
          {e.politica ? (
            <p className="text-xs text-muted-foreground">
              {e.politica.titulo}
              {e.politica.firmadaEn ? ` · firmada el ${formatFechaCorta(new Date(e.politica.firmadaEn))}` : ' · sin fecha de firma'}
            </p>
          ) : <p className="text-xs text-muted-foreground">Sube la política en Jurídica (categoría Política) y vincúlala aquí como la del SG-SST.</p>}
        </div>
        <Pill tone={e.politica?.firmadaEn ? 'ok' : e.politica ? 'warn' : 'bad'}>{e.politica?.firmadaEn ? 'Firmada' : e.politica ? 'Sin firma' : 'Falta'}</Pill>
        {puedeEditar && <Button size="sm" variant="outline" onClick={() => setDialogo('politica')}>{e.politica ? 'Cambiar' : 'Vincular'}</Button>}
      </CardContent></Card>

      <Card><CardContent className="flex flex-wrap items-center gap-3 py-4">
        <Chip icono={IdCard} color="teal" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Responsable del SG-SST</p>
          {e.responsable ? (
            <p className="text-xs text-muted-foreground">
              {e.responsable.colaborador} · designado el {formatFechaCorta(new Date(e.responsable.fechaDesignacion))}
              {e.responsable.licenciaSst ? ` · licencia ${e.responsable.licenciaSst}` : ''}
              {e.responsable.cursoHoras ? ` · curso ${e.responsable.cursoHoras}h` : ''}
            </p>
          ) : <p className="text-xs text-muted-foreground">Nadie ha sido designado formalmente (D.1072 art. 2.2.4.6.8).</p>}
          {e.responsable?.cartaDocId && (
            <a href={`/api/documentos/${e.responsable.cartaDocId}`} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">Ver carta de designación</a>
          )}
        </div>
        <Pill tone={e.responsable ? (e.responsable.cartaDocId ? 'ok' : 'warn') : 'bad'}>{e.responsable ? (e.responsable.cartaDocId ? 'Designado' : 'Sin carta') : 'Falta'}</Pill>
        {puedeEditar && <Button size="sm" variant="outline" onClick={() => setDialogo('responsable')}>{e.responsable ? 'Cambiar' : 'Designar'}</Button>}
      </CardContent></Card>

      <Card><CardContent className="flex flex-wrap items-center gap-3 py-4">
        <Chip icono={ClipboardCheck} color="violet" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Plan de trabajo anual {e.anioActual}</p>
          {e.plan ? (
            <p className="text-xs text-muted-foreground">
              Avance {e.plan.avancePct}%{e.plan.aprobadoPor ? ` · aprobado por ${e.plan.aprobadoPor}` : ''}
              {e.plan.notas ? ` · ${e.plan.notas}` : ''}
            </p>
          ) : <p className="text-xs text-muted-foreground">No se ha registrado el plan de este año.</p>}
          {e.plan?.documentoId && (
            <a href={`/api/documentos/${e.plan.documentoId}`} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">Ver plan (PDF)</a>
          )}
        </div>
        <Pill tone={e.plan ? (e.plan.documentoId ? 'ok' : 'warn') : 'bad'}>{e.plan ? (e.plan.documentoId ? 'Registrado' : 'Sin PDF') : 'Falta'}</Pill>
        {puedeEditar && <Button size="sm" variant="outline" onClick={() => setDialogo('plan')}>{e.plan ? 'Actualizar' : 'Registrar'}</Button>}
      </CardContent></Card>

      {dialogo === 'politica' && <DialogPolitica politicas={e.politicasDisponibles} onClose={() => setDialogo(null)} />}
      {dialogo === 'responsable' && <DialogResponsable onClose={() => setDialogo(null)} />}
      {dialogo === 'plan' && <DialogPlanTrabajo plan={e.plan} anioActual={e.anioActual} onClose={() => setDialogo(null)} />}
    </div>
  )
}

function DialogPolitica({ politicas, onClose }: { politicas: Props['estructura']['politicasDisponibles']; onClose: () => void }) {
  const router = useRouter()
  const [documentoLegalId, setDocumentoLegalId] = useState(politicas.find((x) => x.esSgSst)?.id ?? '')
  const [firmadaEn, setFirmadaEn] = useState(new Date().toISOString().slice(0, 10))
  const [g, setG] = useState(false)
  async function guardar() {
    if (!documentoLegalId) { toast.error('Selecciona la política.'); return }
    setG(true)
    const res = await marcarPoliticaSgsst({ documentoLegalId, firmadaEn })
    setG(false)
    if (res.ok) { toast.success('Política del SG-SST vinculada.'); onClose(); router.refresh() } else toast.error(res.error)
  }
  return (<Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent><DialogHeader><DialogTitle>Política del SG-SST</DialogTitle></DialogHeader>
    <div className="space-y-4">
      {politicas.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay documentos de categoría Política en Jurídica. Súbelo primero en <b>Jurídica → Documentos legales</b> y vuelve aquí.</p>
      ) : (<>
        <Campo label="Documento (Jurídica → categoría Política)">
          <Select value={documentoLegalId} onValueChange={setDocumentoLegalId}><SelectTrigger className="w-full"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
            <SelectContent>{politicas.map((x) => <SelectItem key={x.id} value={x.id}>{x.titulo}</SelectItem>)}</SelectContent></Select>
        </Campo>
        <Campo label="Fecha de firma del representante legal"><Input type="date" value={firmadaEn} onChange={(ev) => setFirmadaEn(ev.target.value)} /></Campo>
      </>)}
    </div>
    <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={guardar} disabled={g || politicas.length === 0}>{g && <Spinner />}Vincular</Button></DialogFooter></DialogContent></Dialog>)
}

function DialogResponsable({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [colaboradorId, setColaboradorId] = useState('')
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [licencia, setLicencia] = useState('')
  const [horas, setHoras] = useState('')
  const [carta, setCarta] = useState<File | null>(null)
  const [g, setG] = useState(false)
  async function guardar() {
    if (!colaboradorId) { toast.error('Selecciona el colaborador.'); return }
    setG(true)
    const res = await designarResponsableSgsst({ colaboradorId, fechaDesignacion: fecha, licenciaSst: licencia || undefined, cursoHoras: horas ? Number(horas) : undefined })
    if (!res.ok) { setG(false); toast.error(res.error); return }
    const responsableId = (res.datos as { id: string }).id
    if (carta) {
      const docId = await subirDoc(carta, 'ResponsableSgsst', responsableId, 'Carta de designación SG-SST')
      if (docId) await vincularCartaResponsable({ responsableId, documentoId: docId })
      else toast.warning('La designación quedó registrada, pero la carta no se pudo adjuntar.')
    }
    setG(false); toast.success('Responsable del SG-SST designado.'); onClose(); router.refresh()
  }
  return (<Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>Designar responsable del SG-SST</DialogTitle></DialogHeader>
    <div className="space-y-4">
      <Campo label="Colaborador"><SelectorColaborador value={colaboradorId} onChange={setColaboradorId} /></Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Fecha de designación"><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Campo>
        <Campo label="Curso virtual (horas)"><Select value={horas} onValueChange={setHoras}><SelectTrigger className="w-full"><SelectValue placeholder="—" /></SelectTrigger><SelectContent><SelectItem value="20">20 horas</SelectItem><SelectItem value="50">50 horas</SelectItem></SelectContent></Select></Campo>
      </div>
      <Campo label="Licencia en SST (si aplica)"><Input value={licencia} onChange={(e) => setLicencia(e.target.value)} placeholder="Nro. de licencia" /></Campo>
      <Campo label="Carta de designación firmada (PDF/foto)">
        <input type="file" accept="image/*,application/pdf" onChange={(e) => setCarta(e.target.files?.[0] ?? null)} className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground" />
      </Campo>
      <p className="text-xs text-muted-foreground">La designación anterior queda en el histórico (se desactiva automáticamente).</p>
    </div>
    <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={guardar} disabled={g}>{g && <Spinner />}Designar</Button></DialogFooter></DialogContent></Dialog>)
}

function DialogPlanTrabajo({ plan, anioActual, onClose }: { plan: Props['estructura']['plan']; anioActual: number; onClose: () => void }) {
  const router = useRouter()
  const [anio, setAnio] = useState(String(plan?.anio ?? anioActual))
  const [aprobadoPor, setAprobadoPor] = useState(plan?.aprobadoPor ?? '')
  const [avance, setAvance] = useState(String(plan?.avancePct ?? 0))
  const [notas, setNotas] = useState(plan?.notas ?? '')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [g, setG] = useState(false)
  async function guardar() {
    setG(true)
    const res = await guardarPlanTrabajoSst({ anio: Number(anio), aprobadoPor: aprobadoPor || undefined, avancePct: Number(avance), notas: notas || undefined })
    if (!res.ok) { setG(false); toast.error(res.error); return }
    const planId = (res.datos as { id: string }).id
    if (archivo) {
      const docId = await subirDoc(archivo, 'PlanTrabajoSst', planId, `Plan de trabajo SG-SST ${anio}`)
      if (docId) await vincularDocumentoPlanTrabajo({ planId, documentoId: docId })
      else toast.warning('El plan quedó registrado, pero el PDF no se pudo adjuntar.')
    }
    setG(false); toast.success('Plan de trabajo anual guardado.'); onClose(); router.refresh()
  }
  return (<Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>Plan de trabajo anual SG-SST</DialogTitle></DialogHeader>
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Año"><Input type="number" value={anio} onChange={(e) => setAnio(e.target.value)} /></Campo>
        <Campo label="Avance (%)"><Input type="number" min={0} max={100} value={avance} onChange={(e) => setAvance(e.target.value)} /></Campo>
      </div>
      <Campo label="Aprobado por"><Input value={aprobadoPor} onChange={(e) => setAprobadoPor(e.target.value)} placeholder="Empleador / representante legal" /></Campo>
      <Campo label="Notas"><Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} /></Campo>
      <Campo label="PDF del plan firmado">
        <input type="file" accept="image/*,application/pdf" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground" />
      </Campo>
    </div>
    <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={guardar} disabled={g}>{g && <Spinner />}Guardar</Button></DialogFooter></DialogContent></Dialog>)
}

// ── Matriz legal (normograma) ───────────────────────────────────────────────

function DialogNorma({ norma, puedeEditar = true, onClose }: { norma?: Props['normas'][number]; puedeEditar?: boolean; onClose: () => void }) {
  const router = useRouter()
  const [f, setF] = useState<Record<string, string>>({
    norma: norma?.norma ?? '', emisor: norma?.emisor ?? '', tema: norma?.tema ?? '', articulos: norma?.articulos ?? '',
    comoCumple: norma?.comoCumple ?? '', cumplimiento: norma?.cumplimiento ?? 'NO_CUMPLE', responsableRol: norma?.responsableRol ?? '',
  })
  const [archivo, setArchivo] = useState<File | null>(null)
  const [g, setG] = useState(false)
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))
  const soloLectura = !puedeEditar

  async function guardar() {
    setG(true)
    const res = await guardarNormaMatrizLegal({
      id: norma?.id, norma: f.norma, emisor: f.emisor || undefined, tema: f.tema, articulos: f.articulos || undefined,
      comoCumple: f.comoCumple || undefined, cumplimiento: f.cumplimiento as 'CUMPLE', responsableRol: f.responsableRol || undefined,
    })
    if (!res.ok) { setG(false); toast.error(res.error); return }
    const normaId = (res.datos as { id: string }).id
    if (archivo) {
      const docId = await subirDoc(archivo, 'NormaMatrizLegal', normaId, `Evidencia — ${f.norma}`)
      if (docId) await vincularEvidenciaNorma({ normaId, documentoId: docId })
      else toast.warning('La norma se guardó, pero la evidencia no se pudo adjuntar.')
    }
    setG(false); toast.success('Norma guardada.'); onClose(); router.refresh()
  }

  async function eliminar() {
    if (!norma) return
    const res = await eliminarNormaMatrizLegal({ id: norma.id })
    if (res.ok) { toast.success('Norma retirada de la matriz.'); onClose(); router.refresh() } else toast.error(res.error)
  }

  return (<Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>{norma ? 'Norma de la matriz legal' : 'Agregar norma'}</DialogTitle></DialogHeader>
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Norma"><Input value={f.norma} onChange={(e) => set('norma', e.target.value)} placeholder="Decreto 1072 de 2015" disabled={soloLectura} /></Campo>
        <Campo label="Emisor"><Input value={f.emisor} onChange={(e) => set('emisor', e.target.value)} placeholder="Ministerio del Trabajo" disabled={soloLectura} /></Campo>
      </div>
      <Campo label="Tema / qué regula"><Textarea rows={2} value={f.tema} onChange={(e) => set('tema', e.target.value)} disabled={soloLectura} /></Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Artículos aplicables"><Input value={f.articulos} onChange={(e) => set('articulos', e.target.value)} disabled={soloLectura} /></Campo>
        <Campo label="Cumplimiento"><Select value={f.cumplimiento} onValueChange={(v) => set('cumplimiento', v)} disabled={soloLectura}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(CUMPLIMIENTO).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select></Campo>
      </div>
      <Campo label="Cómo cumple la empresa"><Textarea rows={2} value={f.comoCumple} onChange={(e) => set('comoCumple', e.target.value)} disabled={soloLectura} /></Campo>
      <Campo label="Responsable (rol)"><Input value={f.responsableRol} onChange={(e) => set('responsableRol', e.target.value)} placeholder="Responsable SST" disabled={soloLectura} /></Campo>
      {norma?.evidenciaDocId && (
        <a href={`/api/documentos/${norma.evidenciaDocId}`} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">Ver evidencia adjunta</a>
      )}
      {!soloLectura && (
        <Campo label="Evidencia de cumplimiento (PDF/foto)">
          <input type="file" accept="image/*,application/pdf" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground" />
        </Campo>
      )}
    </div>
    <DialogFooter className="gap-2">
      {norma && !soloLectura && <Button variant="ghost" className="text-destructive" onClick={eliminar}>Retirar</Button>}
      <Button variant="ghost" onClick={onClose}>Cerrar</Button>
      {!soloLectura && <Button onClick={guardar} disabled={g || !f.norma || !f.tema}>{g && <Spinner />}Guardar</Button>}
    </DialogFooter></DialogContent></Dialog>)
}

// ── Autoevaluación + plan de mejoramiento (Res. 0312 art. 28) ───────────────

function PanelAutoeval({ autoeval, puedeEditar }: { autoeval: Props['autoeval']; puedeEditar: boolean }) {
  const router = useRouter()
  const [dialogoAccion, setDialogoAccion] = useState(false)
  const [subiendoPlan, setSubiendoPlan] = useState(false)

  async function adjuntarPlan(archivo: File) {
    if (!autoeval) return
    setSubiendoPlan(true)
    const docId = await subirDoc(archivo, 'AutoevaluacionSst', autoeval.id, `Plan de mejora SG-SST ${autoeval.anio}`)
    if (docId) {
      await vincularDocumentoAutoeval({ autoevaluacionId: autoeval.id, documentoId: docId })
      toast.success('Plan de mejora firmado adjuntado.')
      router.refresh()
    } else toast.error('No se pudo adjuntar el documento.')
    setSubiendoPlan(false)
  }

  async function marcar(id: string, cumplida: boolean) {
    const res = await marcarAccionMejora({ id, cumplida })
    if (res.ok) { toast.success(cumplida ? 'Acción marcada como cumplida.' : 'Acción reabierta.'); router.refresh() } else toast.error(res.error)
  }

  async function adjuntarEvidencia(accionId: string, archivo: File) {
    const docId = await subirDoc(archivo, 'AccionMejoraSst', accionId, 'Evidencia acción de mejora')
    if (docId) {
      await vincularEvidenciaAccionMejora({ accionId, documentoId: docId })
      toast.success('Evidencia adjuntada.')
      router.refresh()
    } else toast.error('No se pudo adjuntar la evidencia.')
  }

  async function eliminar(id: string) {
    const res = await eliminarAccionMejora({ id })
    if (res.ok) { toast.success('Acción eliminada.'); router.refresh() } else toast.error(res.error)
  }

  if (!autoeval) return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Sin autoevaluación registrada. Usa “Nuevo” para registrarla.</CardContent></Card>

  const cumplidas = autoeval.acciones.filter((a) => a.cumplida).length

  return (
    <div className="space-y-3">
      <Card><CardContent className="flex flex-wrap items-center gap-3 py-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm">Año {autoeval.anio}: <b>{autoeval.puntaje}%</b> (nivel {autoeval.nivelEstandar} estándares)</p>
          {autoeval.planMejora && <p className="text-sm text-muted-foreground">Plan de mejora: {autoeval.planMejora}</p>}
          {autoeval.documentoId && (
            <a href={`/api/documentos/${autoeval.documentoId}`} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">Ver plan de mejora firmado (PDF)</a>
          )}
        </div>
        {puedeEditar && (
          <label className="cursor-pointer text-xs text-primary hover:underline">
            {subiendoPlan ? 'Subiendo…' : autoeval.documentoId ? 'Reemplazar PDF' : 'Adjuntar PDF firmado'}
            <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) adjuntarPlan(f) }} />
          </label>
        )}
      </CardContent></Card>

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Acciones de mejora {autoeval.acciones.length > 0 && <span className="text-muted-foreground font-normal">— {cumplidas} de {autoeval.acciones.length} cumplidas</span>}</p>
        {puedeEditar && <Button size="sm" variant="outline" onClick={() => setDialogoAccion(true)}><Plus className="size-4" /> Acción</Button>}
      </div>

      {autoeval.acciones.length === 0 ? (
        <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">Sin acciones registradas. Cada estándar incumplido de la autoevaluación debería tener su acción con responsable y fecha límite.</CardContent></Card>
      ) : (
        <Card><CardContent className="p-0 divide-y">{autoeval.acciones.map((a) => (
          <div key={a.id} className="flex items-start gap-3 p-3">
            {puedeEditar ? (
              <Checkbox className="mt-0.5" checked={a.cumplida} onCheckedChange={(v) => marcar(a.id, Boolean(v))} />
            ) : (
              a.cumplida ? <CircleCheck className="mt-0.5 size-4 text-emerald-600" /> : <CircleAlert className="mt-0.5 size-4 text-amber-500" />
            )}
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className={`text-sm ${a.cumplida ? 'text-muted-foreground line-through' : 'font-medium'}`}>{a.actividad}</p>
              <p className="text-xs text-muted-foreground">
                {a.responsable} · límite {formatFechaCorta(new Date(a.fechaLimite))}
                {a.recursos ? ` · recursos: ${a.recursos}` : ''}
                {a.cumplida && a.cumplidaEn ? ` · cumplida el ${formatFechaCorta(new Date(a.cumplidaEn))}` : ''}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                {a.evidenciaDocId && <a href={`/api/documentos/${a.evidenciaDocId}`} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">Ver evidencia</a>}
                {puedeEditar && (
                  <label className="cursor-pointer text-xs text-muted-foreground hover:text-primary hover:underline">
                    {a.evidenciaDocId ? 'Reemplazar evidencia' : 'Adjuntar evidencia'}
                    <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) adjuntarEvidencia(a.id, f) }} />
                  </label>
                )}
                {puedeEditar && !a.cumplida && (
                  <button type="button" onClick={() => eliminar(a.id)} className="text-xs text-destructive hover:underline">Eliminar</button>
                )}
              </div>
            </div>
            {a.vencida && <Pill tone="bad">Vencida</Pill>}
            {a.cumplida && <Pill tone="ok">Cumplida</Pill>}
          </div>
        ))}</CardContent></Card>
      )}

      {dialogoAccion && <DialogAccionMejora autoevaluacionId={autoeval.id} onClose={() => setDialogoAccion(false)} />}
    </div>
  )
}

function DialogAccionMejora({ autoevaluacionId, onClose }: { autoevaluacionId: string; onClose: () => void }) {
  const router = useRouter()
  const [f, setF] = useState<Record<string, string>>({})
  const [g, setG] = useState(false)
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))
  async function guardar() {
    if (!f.actividad || !f.responsable || !f.fechaLimite) { toast.error('Actividad, responsable y fecha límite son obligatorios.'); return }
    setG(true)
    const res = await crearAccionMejora({ autoevaluacionId, actividad: f.actividad, responsable: f.responsable, fechaLimite: f.fechaLimite, recursos: f.recursos })
    setG(false)
    if (res.ok) { toast.success('Acción registrada. Se programó la alerta de la fecha límite.'); onClose(); router.refresh() } else toast.error(res.error)
  }
  return (<Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent><DialogHeader><DialogTitle>Acción del plan de mejora</DialogTitle></DialogHeader>
    <div className="space-y-4">
      <Campo label="Actividad"><Textarea rows={2} onChange={(e) => set('actividad', e.target.value)} placeholder="Qué se va a hacer para cerrar el estándar incumplido" /></Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Responsable"><Input onChange={(e) => set('responsable', e.target.value)} /></Campo>
        <Campo label="Fecha límite"><Input type="date" onChange={(e) => set('fechaLimite', e.target.value)} /></Campo>
      </div>
      <Campo label="Recursos (opcional)"><Input onChange={(e) => set('recursos', e.target.value)} placeholder="Presupuesto, personal, materiales…" /></Campo>
    </div>
    <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={guardar} disabled={g}>{g && <Spinner />}Registrar</Button></DialogFooter></DialogContent></Dialog>)
}

// ── Salud ocupacional: novedades ARL y seguimiento a recomendaciones ────────

function DialogNovedadArl({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [colaboradorId, setColaboradorId] = useState('')
  const [tipo, setTipo] = useState('AFILIACION')
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [claseRiesgo, setClaseRiesgo] = useState('')
  const [detalle, setDetalle] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [g, setG] = useState(false)

  async function guardar() {
    if (!colaboradorId) { toast.error('Selecciona un colaborador.'); return }
    if (tipo === 'CAMBIO_CLASE_RIESGO' && !claseRiesgo) { toast.error('Indica la nueva clase de riesgo.'); return }
    setG(true)
    const res = await registrarNovedadArl({
      colaboradorId, tipo: tipo as 'AFILIACION', fecha, detalle: detalle || undefined,
      claseRiesgo: (claseRiesgo || '') as '' | 'I',
    })
    if (!res.ok) { setG(false); toast.error(res.error); return }
    const novedadId = (res.datos as { id: string }).id
    if (archivo) {
      const docId = await subirDoc(archivo, 'NovedadArl', novedadId, `Soporte novedad ARL — ${TIPO_NOVEDAD_ARL[tipo]}`)
      if (docId) await vincularSoporteNovedadArl({ novedadId, documentoId: docId })
      else toast.warning('La novedad se registró, pero el soporte no se pudo adjuntar.')
    }
    setG(false); toast.success('Novedad de ARL registrada.'); onClose(); router.refresh()
  }

  return (<Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>Registrar novedad de ARL</DialogTitle></DialogHeader>
    <div className="space-y-4">
      <Campo label="Colaborador"><SelectorColaborador value={colaboradorId} onChange={setColaboradorId} /></Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Tipo"><Select value={tipo} onValueChange={setTipo}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(TIPO_NOVEDAD_ARL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select></Campo>
        <Campo label="Fecha"><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Campo>
      </div>
      {tipo === 'CAMBIO_CLASE_RIESGO' && (
        <Campo label="Nueva clase de riesgo">
          <Select value={claseRiesgo} onValueChange={setClaseRiesgo}><SelectTrigger className="w-full"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
            <SelectContent>{['I', 'II', 'III', 'IV', 'V'].map((c) => <SelectItem key={c} value={c}>Clase {c}</SelectItem>)}</SelectContent></Select>
        </Campo>
      )}
      <Campo label="Detalle (opcional)"><Textarea rows={2} value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder="ARL destino, motivo del cambio…" /></Campo>
      <Campo label="Soporte (formulario/constancia de la ARL)">
        <input type="file" accept="image/*,application/pdf" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground" />
      </Campo>
      <p className="text-xs text-muted-foreground">Un cambio de clase de riesgo actualiza también la ficha del colaborador.</p>
    </div>
    <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={guardar} disabled={g}>{g && <Spinner />}Registrar</Button></DialogFooter></DialogContent></Dialog>)
}

function DialogSeguimientoRecomendaciones({ examen, onClose }: { examen: Props['examenes'][number]; onClose: () => void }) {
  const router = useRouter()
  const [nota, setNota] = useState('')
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [g, setG] = useState(false)

  async function agregar() {
    if (!nota.trim()) { toast.error('Escribe la nota de seguimiento.'); return }
    setG(true)
    const res = await crearSeguimientoExamen({ examenId: examen.id, fecha, nota: nota.trim() })
    setG(false)
    if (res.ok) { setNota(''); toast.success('Seguimiento registrado.'); router.refresh() } else toast.error(res.error)
  }

  async function cerrar(cerrado: boolean) {
    const res = await cerrarSeguimientoExamen({ examenId: examen.id, cerrado })
    if (res.ok) { toast.success(cerrado ? 'Seguimiento cerrado.' : 'Seguimiento reabierto.'); onClose(); router.refresh() } else toast.error(res.error)
  }

  return (<Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>Seguimiento a recomendaciones — {examen.colaborador}</DialogTitle></DialogHeader>
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">Dato de salud (Ley 1581): visible solo con permiso sobre datos de salud.</p>
      {examen.recomendaciones && <div><Label className="mb-1">Recomendaciones</Label><p className="text-sm text-muted-foreground">{examen.recomendaciones}</p></div>}
      {examen.restricciones && <div><Label className="mb-1">Restricciones</Label><p className="text-sm text-muted-foreground">{examen.restricciones}</p></div>}

      {examen.seguimientos.length > 0 && (
        <div className="space-y-1">
          <Label>Notas de seguimiento</Label>
          <ul className="space-y-1.5">{examen.seguimientos.map((s) => (
            <li key={s.id} className="rounded-md border p-2 text-sm">
              <p className="text-xs font-medium">{formatFechaCorta(new Date(s.fecha))}</p>
              <p className="text-xs text-muted-foreground">{s.nota}</p>
            </li>
          ))}</ul>
        </div>
      )}

      <div className="space-y-2 rounded-md border p-3">
        <div className="grid grid-cols-2 gap-2"><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
        <Textarea rows={2} placeholder="Qué se verificó, ajustes al puesto, remisiones…" value={nota} onChange={(e) => setNota(e.target.value)} />
        <Button size="sm" onClick={agregar} disabled={g}>{g && <Spinner />}Agregar nota</Button>
      </div>
    </div>
    <DialogFooter className="gap-2">
      {examen.seguimientoCerrado
        ? <Button variant="outline" onClick={() => cerrar(false)}>Reabrir seguimiento</Button>
        : <Button variant="outline" onClick={() => cerrar(true)}>Cerrar seguimiento</Button>}
      <Button variant="ghost" onClick={onClose}>Cerrar</Button>
    </DialogFooter></DialogContent></Dialog>)
}
