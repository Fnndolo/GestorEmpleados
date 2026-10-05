import Link from 'next/link'
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { AvatarColaborador, Pill } from '@/components/ui-kit'
import { AsignarHorario, type PlantillaHorario } from '@/components/horarios/asignar-horario'
import { conexionAsistencia } from '@/server/asistencia/cliente'
import { sedeActualId } from '@/server/sede-actual'
import { datosCronograma } from '@/server/cronograma'
import { VINCULOS_SIN_HORARIO } from '@/server/horarios'
import { mesesVecinos } from '@/lib/cronograma'
import { horasSemana, jornadaMaximaSemanal, resumenHorario, textoHoras, type DiasHorario } from '@/lib/horarios'
import { fechaBreve } from '@/lib/notificaciones/texto'
import { urlFoto } from '@/lib/foto'
import { formatFechaISO, hoyBogota } from '@/lib/fechas'
import { cn } from '@/lib/utils'
import { PlantillasCliente } from './plantillas-cliente'
import { ImportarAsistencia } from './importar-asistencia'
import { BotonAgregar } from '@/components/ui-kit/boton-agregar'
import { CronogramaCliente } from './cronograma-cliente'

export const metadata = { title: 'Horarios · Smart Gadgets RH' }

const VISTAS = { personas: 'Personas', plantillas: 'Horarios', cronograma: 'Turnos dominicales' } as const
type Vista = keyof typeof VISTAS

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const nombreMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`

/**
 * Horarios: quién tiene qué horario (y cambiarlo), las plantillas de horario
 * y el cronograma de domingos y festivos de cada sede. El horario de cada
 * persona también se ve y se cambia desde su ficha.
 */
export default async function HorariosPage({ searchParams }: { searchParams: Promise<{ ver?: string; sede?: string; mes?: string; nuevo?: string }> }) {
  const usuario = await requerirPermiso('horarios', 'VER')
  const puedeEditar = tienePermiso(usuario, 'horarios', 'EDITAR')
  const sp = await searchParams
  const vista: Vista = sp.ver && sp.ver in VISTAS ? (sp.ver as Vista) : 'personas'

  const hoy = hoyBogota()
  const hoyISO = formatFechaISO(hoy)
  const [sedes, plantillasBd, conAsistencia, sedeMenu] = await Promise.all([
    prisma.sede.findMany({ where: { activa: true }, orderBy: { nombre: 'asc' }, select: { id: true, nombre: true } }),
    prisma.horario.findMany({ orderBy: { nombre: 'asc' } }),
    conexionAsistencia('horarios').then(Boolean),
    sedeActualId(),
  ])
  const plantillas: PlantillaHorario[] = plantillasBd.filter((p) => p.activo).map((p) => ({ id: p.id, nombre: p.nombre, dias: p.dias as DiasHorario }))
  // La sede: la que se pida, si no la del menú lateral (en Personas, «todas» vale).
  const sedeId = sp.sede && sedes.some((s) => s.id === sp.sede) ? sp.sede : sedeMenu && sedes.some((s) => s.id === sedeMenu) ? sedeMenu : null

  const enlace = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams({ ver: vista, ...(sedeId ? { sede: sedeId } : {}), ...(sp.mes ? { mes: sp.mes } : {}) })
    for (const [k, v] of Object.entries(cambios)) if (v == null) p.delete(k); else p.set(k, v)
    return `/horarios?${p}`
  }

  return (
    <div className="max-w-7xl">
      <Encabezado
        titulo="Horarios"
        enLinea
        acciones={puedeEditar && conAsistencia && vista !== 'cronograma' ? <ImportarAsistencia /> : undefined}
      />

      <div className="mb-4 flex items-center gap-2">
      <div className="flex min-w-0 gap-1.5 overflow-x-auto">
        {(Object.keys(VISTAS) as Vista[]).map((k) => (
          <Link
            key={k}
            href={`/horarios?ver=${k}${sedeId ? `&sede=${sedeId}` : ''}`}
            className={cn(
              'shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
              vista === k ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent',
            )}
          >
            {VISTAS[k]}
          </Link>
        ))}
      </div>
        {puedeEditar && vista === 'plantillas' && (
          // En la fila de las pestañas, sin gastar otra: en el celular solo el +.
          <BotonAgregar etiqueta="Nuevo horario" href="/horarios?ver=plantillas&nuevo=1" className="ml-auto" />
        )}
      </div>

      {vista === 'personas' && (
        <Personas
          sedes={sedes} sedeId={sedeId} enlace={enlace} plantillas={plantillas}
          puedeEditar={puedeEditar} conAsistencia={conAsistencia} hoyISO={hoyISO}
        />
      )}

      {vista === 'plantillas' && (
        <PlantillasCliente
          key={sp.nuevo ?? 'lista'}
          abrirNueva={puedeEditar && sp.nuevo === '1'}
          puedeEditar={puedeEditar}
          hoy={hoyISO}
          plantillas={await Promise.all(plantillasBd.map(async (p) => ({
            id: p.id, nombre: p.nombre, descripcion: p.descripcion, activo: p.activo, dias: p.dias as DiasHorario,
            personas: await prisma.asignacionHorario.count({ where: { horarioId: p.id, hasta: null } }),
            // Lo tuvo alguien alguna vez: es historial y no se borra (se desactiva).
            usado: (await prisma.asignacionHorario.count({ where: { horarioId: p.id } })) > 0,
          })))}
        />
      )}

      {vista === 'cronograma' && (
        <Cronograma sedes={sedes} sedeId={sedeId ?? sedes[0]?.id ?? null} mesPedido={sp.mes} hoyISO={hoyISO} puedeEditar={puedeEditar} />
      )}
    </div>
  )
}

/** Pestaña Personas: el horario de hoy de cada uno, lo programado y cómo va en AsistencIA. */
async function Personas({ sedes, sedeId, enlace, plantillas, puedeEditar, conAsistencia, hoyISO }: {
  sedes: { id: string; nombre: string }[]
  sedeId: string | null
  enlace: (c: Record<string, string | null>) => string
  plantillas: PlantillaHorario[]
  puedeEditar: boolean
  conAsistencia: boolean
  hoyISO: string
}) {
  const hoy = hoyBogota()
  const colabs = await prisma.colaborador.findMany({
    where: { estado: 'ACTIVO', tipoVinculo: { notIn: [...VINCULOS_SIN_HORARIO] }, ...(sedeId ? { sedeId } : {}) },
    select: {
      id: true, nombres: true, apellidos: true, fotoPath: true,
      sede: { select: { nombre: true } }, cargo: { select: { nombre: true } },
      asignacionesHorario: {
        where: { OR: [{ hasta: null }, { hasta: { gte: hoy } }] },
        orderBy: { desde: 'asc' },
        select: { id: true, desde: true, dias: true, horarioId: true, sincronizadoEn: true, errorSincronizacion: true, horario: { select: { nombre: true } } },
      },
    },
    orderBy: [{ nombres: 'asc' }, { apellidos: 'asc' }],
  })
  const filas = colabs.map((c) => {
    const vigente = c.asignacionesHorario.filter((a) => a.desde <= hoy).at(-1) ?? null
    const programada = c.asignacionesHorario.find((a) => a.desde > hoy) ?? null
    return { c, vigente, programada }
  })
  const sinHorario = filas.filter((f) => !f.vigente).length
  const corto = (nombre: string) => nombre.slice(prefijoComun(sedes.map((x) => x.nombre)).length) || nombre

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="flex min-w-0 max-w-full gap-1.5 overflow-x-auto">
          <Link href={enlace({ sede: null })} className={cn('shrink-0 rounded-full border px-2.5 py-0.5 text-xs', !sedeId ? 'border-foreground bg-foreground text-background' : 'hover:bg-accent')}>Todas</Link>
          {sedes.map((s) => (
            <Link key={s.id} href={enlace({ sede: s.id })} title={s.nombre} className={cn('shrink-0 rounded-full border px-2.5 py-0.5 text-xs', sedeId === s.id ? 'border-foreground bg-foreground text-background' : 'hover:bg-accent')}>{corto(s.nombre)}</Link>
          ))}
        </div>
        <span className="ml-auto text-xs text-muted-foreground">
          {filas.length} persona{filas.length === 1 ? '' : 's'}{sinHorario ? ` · ${sinHorario} sin horario` : ''}
        </span>
      </div>

      {filas.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
          <Clock className="size-8" /> No hay personas con vínculo laboral en esta sede.
        </CardContent></Card>
      ) : (
        <Card className="py-0"><CardContent className="divide-y p-0">
          {filas.map(({ c, vigente, programada }) => {
            const nombre = `${c.nombres} ${c.apellidos}`
            const dias = vigente?.dias as DiasHorario | undefined
            return (
              <div key={c.id} className="flex items-center gap-3 p-3">
                <AvatarColaborador nombre={nombre} fotoUrl={urlFoto(c.id, c.fotoPath, true)} />
                <div className="grid min-w-0 flex-1 gap-x-3 sm:grid-cols-2 sm:items-center">
                  <div className="min-w-0">
                    <Link href={`/colaboradores/${c.id}?tab=horario`} className="block truncate text-sm font-medium hover:underline">{nombre}</Link>
                    <p className="truncate text-xs text-muted-foreground max-sm:hidden">{[c.cargo?.nombre, sedeId ? null : corto(c.sede.nombre)].filter(Boolean).join(' · ')}</p>
                  </div>
                  <div className="min-w-0">
                    {vigente && dias ? (
                      <>
                        <p className="truncate text-xs sm:text-sm">
                          <span className="font-medium">{vigente.horario?.nombre ?? 'Horario propio'}</span>
                          <span className={horasSemana(dias) > jornadaMaximaSemanal(hoy) ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'} title={horasSemana(dias) > jornadaMaximaSemanal(hoy) ? `Pasa de la jornada máxima legal (${jornadaMaximaSemanal(hoy)} h)` : undefined}> · {textoHoras(horasSemana(dias))}</span>
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{resumenHorario(dias)}</p>
                      </>
                    ) : (
                      <p className="mt-0.5"><Pill tone="warn">Sin horario</Pill></p>
                    )}
                    {(programada || (conAsistencia && vigente?.errorSincronizacion)) && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {programada && <Pill tone="info">Cambia el {fechaBreve(programada.desde)}</Pill>}
                        {conAsistencia && vigente?.errorSincronizacion && (
                          <span title={vigente.errorSincronizacion}><Pill tone="bad">No llegó a AsistencIA</Pill></span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {puedeEditar && (
                  <AsignarHorario
                    colaboradorId={c.id} nombre={nombre} plantillas={plantillas} hoy={hoyISO} conAsistencia={conAsistencia}
                    actual={vigente ? { horarioId: vigente.horarioId, dias: vigente.dias as DiasHorario } : null}
                    etiqueta={vigente ? 'Cambiar' : 'Asignar'} variante="outline" compacto
                  />
                )}
              </div>
            )
          })}
        </CardContent></Card>
      )}
    </>
  )
}

/** Pestaña Turnos dominicales (domingos y festivos): la grilla del mes de una sede. */
async function Cronograma({ sedes, sedeId, mesPedido, hoyISO, puedeEditar }: {
  sedes: { id: string; nombre: string }[]
  sedeId: string | null
  mesPedido?: string
  hoyISO: string
  puedeEditar: boolean
}) {
  if (!sedeId) return <p className="text-sm text-muted-foreground">No hay sedes activas.</p>
  const mesActual = hoyISO.slice(0, 7)
  // Por defecto, el mes que viene: el cronograma se arma antes de que empiece.
  const mes = mesPedido && /^\d{4}-\d{2}$/.test(mesPedido) ? mesPedido : mesesVecinos(mesActual).siguiente
  const { anterior, siguiente } = mesesVecinos(mes)
  const datos = await datosCronograma(sedeId, mes)
  const q = (m: string, s = sedeId) => `/horarios?ver=cronograma&sede=${s}&mes=${m}`
  // «Smart Gadgets-Pasto» → «Pasto»: lo que todas repiten no distingue, y así cabe con los botones en una fila.
  const corto = (nombre: string) => (sedes.length > 1 ? nombre.slice(prefijoComun(sedes.map((x) => x.nombre)).length) : nombre) || nombre

  return (
    <CronogramaCliente
      key={`${sedeId}-${mes}`}
      filtros={<>
        <div className="flex items-center rounded-lg border">
          <Link href={q(anterior)} className="grid size-8 place-items-center hover:bg-accent" aria-label="Mes anterior"><ChevronLeft className="size-4" /></Link>
          <span className="min-w-36 px-2 text-center text-sm font-medium">{nombreMes(mes)}</span>
          <Link href={q(siguiente)} className="grid size-8 place-items-center hover:bg-accent" aria-label="Mes siguiente"><ChevronRight className="size-4" /></Link>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {sedes.map((s) => (
            <Link key={s.id} href={q(mes, s.id)} title={s.nombre} className={cn('rounded-full border px-2.5 py-0.5 text-xs', sedeId === s.id ? 'border-foreground bg-foreground text-background' : 'hover:bg-accent')}>{corto(s.nombre)}</Link>
          ))}
        </div>
      </>}
      sedeId={sedeId}
      mes={mes}
      nombreMes={nombreMes(mes)}
      especiales={datos.especiales}
      personas={datos.personas}
      turnos={datos.turnos}
      antes={datos.antes}
      despues={datos.despues}
      publicadoEn={datos.publicadoEn ? fechaBreve(datos.publicadoEn) : null}
      pendientesDeAviso={datos.pendientesDeAviso}
      editable={puedeEditar && mes >= mesActual}
    />
  )
}

/** Lo que todos los nombres repiten al inicio, cortado en un separador (espacio o guion). */
function prefijoComun(nombres: string[]): string {
  let p = nombres[0] ?? ''
  for (const n of nombres) while (!n.startsWith(p)) p = p.slice(0, -1)
  const corte = Math.max(p.lastIndexOf('-'), p.lastIndexOf(' '))
  return corte >= 0 ? p.slice(0, corte + 1) : ''
}
