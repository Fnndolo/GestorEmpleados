'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import {
  CalendarRange, Clock, IdCard, FileText, FolderUp, FileBadge, CalendarClock, HeartPulse,
  PenLine, Receipt, GraduationCap, Package, Scale, ShieldAlert, Lock, Inbox,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { aplicaTramite, esOps, type Tramite } from '@/lib/tramites-vinculo'
import { NuevaSolicitud, type TipoSol } from './nueva-solicitud'

type Item = {
  clave: string
  icono: React.ElementType
  /** Título de escritorio ("Pedir vacaciones"). */
  titulo: string
  /** Título de móvil, corto ("Vacaciones"): el largo se parte feo bajo un ícono. */
  corto: string
  /** Solo escritorio: en móvil el ícono y el título ya bastan. */
  desc: string
  /** Estado real que exige atención ("1 pendiente"). */
  aviso?: string | null
  /** Trámite recién habilitado, para que la gente lo note. */
  nuevo?: boolean
  href?: string
  /** Abre el formulario de solicitud en vez de navegar. */
  sol?: TipoSol
}

/** Tarjeta de escritorio: hay ancho para el título largo y la descripción. */
function Tile({ item, onSolicitar }: { item: Item; onSolicitar: (t: TipoSol) => void }) {
  const { icono: Icono, titulo, desc, aviso, nuevo } = item
  const contenido = (
    <>
      {/* Un solo color para todos los iconos, el de los botones principales: el
          color queda reservado para los avisos de pendiente y nuevo. */}
      <span className="mb-2.5 grid size-9 place-items-center rounded-[9px] bg-foreground text-background">
        <Icono className="size-[18px]" />
      </span>
      <span className="block text-[13px] font-semibold leading-tight">{titulo}</span>
      <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{desc}</span>
      {aviso ? (
        <span className="mt-2 inline-block rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">
          {aviso}
        </span>
      ) : nuevo ? (
        <span className="mt-2 inline-block rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
          Nuevo
        </span>
      ) : null}
    </>
  )
  const clases = cn(
    'rounded-xl border bg-card p-3.5 text-left transition-all',
    'hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  )
  return item.href
    ? <Link href={item.href} className={clases}>{contenido}</Link>
    : <button type="button" onClick={() => item.sol && onSolicitar(item.sol)} className={clases}>{contenido}</button>
}

/**
 * Tarjeta de móvil: solo el ícono dentro del recuadro y el nombre debajo, fuera.
 *
 * En una pantalla de teléfono la descripción no aporta —el nombre ya dice qué
 * es— y obligaba a recuadros altos: nueve trámites se convertían en una pared
 * de desplazamiento. Sacando el texto del recuadro, cada trámite ocupa poco más
 * que su ícono y caben todos casi sin bajar.
 */
function TileCompacto({ item, onSolicitar }: { item: Item; onSolicitar: (t: TipoSol) => void }) {
  const { icono: Icono, corto, aviso, nuevo } = item
  const contenido = (
    <>
      <span className="relative">
        <span className={cn('grid size-16 place-items-center rounded-2xl border bg-card', 'transition-colors group-active/t:bg-accent')}>
          <span className="grid size-9 place-items-center rounded-[10px] bg-foreground text-background">
            <Icono className="size-[18px]" />
          </span>
        </span>
        {/* Lo pendiente se marca sobre el ícono, como una notificación: en este
            tamaño una etiqueta con texto no cabe sin descuadrar la fila. */}
        {aviso ? (
          <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-amber-500 px-1 text-center text-[10px] font-bold leading-4 text-white">
            {aviso.match(/\d+/)?.[0] ?? '!'}
          </span>
        ) : nuevo ? (
          <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-emerald-500 ring-2 ring-background" />
        ) : null}
      </span>
      {/* Alto fijo de dos líneas: sin esto los nombres de una sola línea suben y
          los de dos bajan, y la fila queda con los íconos a distinta altura. */}
      <span className="-mx-1 mt-1 line-clamp-2 block h-[24px] w-[72px] text-center text-[10px] font-medium leading-[12px]">
        {corto}
      </span>
    </>
  )
  const clases = 'group/t flex shrink-0 flex-col items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-2xl'
  return item.href
    ? <Link href={item.href} className={clases}>{contenido}</Link>
    : <button type="button" onClick={() => item.sol && onSolicitar(item.sol)} className={clases}>{contenido}</button>
}

/**
 * Una sección con sus dos caras: cuadrícula con descripciones en escritorio y,
 * en móvil, íconos pequeños en carrusel horizontal, para que ninguna sección
 * empuje hacia abajo la que viene después.
 */
function Seccion({
  titulo, items, onSolicitar,
}: {
  titulo: string
  items: Item[]
  onSolicitar: (t: TipoSol) => void
}) {
  if (items.length === 0) return null
  return (
    // En el celular las secciones van pegadas: separadas de mas parecian dos
    // pantallas distintas y la segunda quedaba lejos del pulgar.
    <section className="mt-2 sm:mt-6">
      <h2 className="mb-2 text-[13px] font-bold sm:mb-2.5">{titulo}</h2>

      {/* Escritorio */}
      <div className="hidden gap-2.5 sm:grid sm:grid-cols-3 lg:grid-cols-4">
        {items.map((i) => <Tile key={i.clave} item={i} onSolicitar={onSolicitar} />)}
      </div>

      {/* Móvil */}
      <CarruselMovil>
        {items.map((i) => (
          <div key={i.clave} className={cn('flex shrink-0 snap-start justify-center', ANCHO_CASILLA)}>
            <TileCompacto item={i} onSolicitar={onSolicitar} />
          </div>
        ))}
      </CarruselMovil>
    </section>
  )
}

/**
 * Ancho de cada casilla del carrusel móvil, calculado para que en pantalla
 * quepan exactamente 4 tiles y MEDIO: el quinto asoma cortado por la mitad y
 * eso, más el degradado del borde, le dice al pulgar que hay más a la derecha.
 * Con el ancho natural del tile (72px) el corte caía donde cayera según el
 * teléfono; a veces justo en el borde y parecía que la fila terminaba ahí.
 *
 * La cuenta: el 100% es el ancho de contenido del carrusel (pantalla − 2rem de
 * padding). Lo visible desde la primera casilla hasta el borde derecho de la
 * pantalla es ese 100% + el 1rem de padding derecho. Ahí caben 4.5 casillas y
 * los 4 huecos de 0.5rem entre ellas (2rem): 4.5·w = 100% + 1rem − 2rem.
 */
const ANCHO_CASILLA = 'basis-[calc((100%-1rem)/4.5)]'

/** ¿Queda contenido a la derecha? El −1 absorbe el redondeo de subpíxeles, que
 *  si no dejaba el degradado prendido con el carrusel ya al tope. */
function quedaPorVer(el: HTMLElement): boolean {
  return el.scrollLeft + el.clientWidth < el.scrollWidth - 1
}

/**
 * Fila deslizable del celular. Se sale del margen del contenido para llegar al
 * borde de la pantalla, y sombrea el borde derecho con un degradado hacia el
 * fondo mientras quede algo por ver: cuando el usuario llega al final el
 * degradado se apaga, porque seguir insinuando "hay más" cuando no hay más es
 * mentirle.
 */
function CarruselMovil({ children }: { children: React.ReactNode }) {
  const [hayMas, setHayMas] = useState(false)
  // El ref hace la medición inicial y vuelve a medir si cambia el tamaño (girar
  // el teléfono); el onScroll cubre el desplazamiento. React 19 acepta que el
  // ref devuelva su limpieza, así el observer se suelta con el elemento.
  const observar = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    const actualizar = () => setHayMas(quedaPorVer(el))
    actualizar()
    const ro = new ResizeObserver(actualizar)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="relative -mx-4 sm:hidden">
      <div
        ref={observar}
        onScroll={(e) => setHayMas(quedaPorVer(e.currentTarget))}
        className={cn(
          'flex snap-x gap-2 overflow-x-auto px-4 scroll-pl-4',
          // El desplazamiento horizontal recorta lo que se salga por arriba, y
          // la insignia de pendientes sobresale del ícono: sin este respiro
          // aparecía cortada por la mitad.
          'pt-2',
          '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        )}
      >
        {children}
      </div>
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-background via-background/70 to-transparent',
          'transition-opacity duration-300',
          hayMas ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  )
}

export function PanelTramites({
  activo, tipoVinculo, fichaFaltantes, contratosPorFirmar, disciplinariosAbiertos, puedeAprobar, saldoVacaciones, documentosFaltantes, dotacionPorFirmar,
}: {
  /** Colaborador con vínculo activo: solo entonces se ofrecen los trámites operativos. */
  activo: boolean
  /** Decide qué trámites aplican: el OPS no tiene los laborales. */
  tipoVinculo: string
  /** Cuántos datos clave de la ficha faltan por completar (para el aviso). */
  fichaFaltantes: number
  contratosPorFirmar: number
  disciplinariosAbiertos: number
  puedeAprobar: boolean
  saldoVacaciones: number
  documentosFaltantes: number
  dotacionPorFirmar: number
}) {
  const [solicitar, setSolicitar] = useState<TipoSol | null>(null)
  /** Atajo local: `aplica('vacaciones')` en vez de repetir el tipo de vínculo. */
  const aplica = (t: Tramite) => aplicaTramite(tipoVinculo, t)
  const ops = esOps(tipoVinculo)
  const plural = (n: number, s: string) => `${n} ${s}${n > 1 ? 's' : ''}`

  const solicitudes: Item[] = [
    // Trámites operativos: solo con vínculo activo.
    activo && aplica('vacaciones') && {
      clave: 'vacaciones', icono: CalendarRange,
      titulo: 'Pedir vacaciones', corto: 'Vacaciones', desc: 'Tu jefe y RRHH aprueban las fechas',
      sol: 'VACACIONES' as TipoSol,
    },
    activo && aplica('permisos') && {
      clave: 'permiso', icono: Clock,
      titulo: 'Pedir permiso', corto: 'Permiso', desc: 'Por día o por horas', sol: 'PERMISO' as TipoSol,
    },
    {
      clave: 'mi-info', icono: IdCard,
      titulo: 'Mi información', corto: 'Mi información', desc: 'Completa tus datos, banco y emergencia',
      aviso: fichaFaltantes > 0 ? `${fichaFaltantes} por completar` : null,
      href: '/autoservicio/mi-informacion',
    },
    aplica('desprendibles') && {
      clave: 'desprendibles', icono: FileText,
      titulo: 'Descargar desprendibles', corto: 'Desprendibles', desc: 'Todos tus pagos en PDF',
      nuevo: true, href: '/autoservicio/desprendibles',
    },
    {
      clave: 'documentos', icono: FolderUp,
      titulo: 'Mis documentos', corto: 'Documentos', desc: 'Sube cédula, diplomas, certificados…',
      aviso: documentosFaltantes > 0 ? plural(documentosFaltantes, 'pendiente') : null,
      nuevo: true, href: '/autoservicio/documentos',
    },
    // La certificación laboral sigue disponible aunque esté retirado (habeas data).
    {
      clave: 'certificacion', icono: FileBadge,
      titulo: ops ? 'Pedir certificación contractual' : 'Pedir certificación', corto: 'Certificación',
      desc: ops ? 'De tu contrato de prestación de servicios' : 'Laboral, con salario, para banco',
      sol: 'CERTIFICACION_LABORAL' as TipoSol,
    },
    activo && aplica('licencias') && {
      clave: 'licencia', icono: CalendarClock,
      titulo: 'Reportar licencia', corto: 'Licencia', desc: 'Maternidad, luto, estudio…',
      nuevo: true, sol: 'LICENCIA' as TipoSol,
    },
    activo && aplica('incapacidades') && {
      clave: 'incapacidad', icono: HeartPulse,
      titulo: 'Subir incapacidad', corto: 'Incapacidad', desc: 'RRHH la valida y registra',
      sol: 'INCAPACIDAD' as TipoSol,
    },
  ].filter(Boolean) as Item[]

  const canales: Item[] = [
    {
      clave: 'contratos', icono: PenLine,
      titulo: 'Firmar contrato', corto: 'Contrato', desc: 'Contrato y autorización de datos',
      aviso: contratosPorFirmar > 0 ? plural(contratosPorFirmar, 'pendiente') : null,
      href: '/autoservicio/contratos',
    },
    // No es solo de OPS: cualquier colaborador cobra comisiones o saldos a su favor.
    // Si tiene contrato OPS activo, la cuenta se vincula y exige verificar la
    // seguridad social; si no, se radica igual. Ver `crearMiCuentaCobro`.
    {
      clave: 'cuentas', icono: Receipt,
      titulo: 'Cuenta de cobro', corto: 'Cuenta de cobro',
      desc: 'Servicios, comisiones o saldos a tu favor', href: '/autoservicio/cuentas-cobro',
    },
    aplica('capacitaciones') && {
      clave: 'capacitaciones', icono: GraduationCap,
      titulo: 'Mis capacitaciones', corto: 'Capacitación', desc: 'Tu historial de formación y notas',
      href: '/autoservicio/capacitaciones',
    },
    // Al OPS sí se le pueden entregar activos en custodia; dotación y EPP no.
    {
      clave: 'entregas', icono: Package,
      titulo: 'Mis entregas', corto: 'Mis entregas',
      desc: ops ? 'Activos a tu cargo con su acta' : 'Activos, dotación y EPP con su recibido',
      aviso: dotacionPorFirmar > 0 ? `${dotacionPorFirmar} por firmar` : null,
      href: '/autoservicio/dotacion',
    },
    // El poder disciplinario sobre un contratista es el indicio más fuerte
    // de subordinación: no se le ofrece el módulo.
    aplica('disciplinarios') && {
      clave: 'disciplinarios', icono: Scale,
      titulo: 'Mis disciplinarios', corto: 'Disciplinarios', desc: 'Presentar descargos o apelar',
      aviso: disciplinariosAbiertos > 0 ? plural(disciplinariosAbiertos, 'abierto') : null,
      href: '/autoservicio/disciplinarios',
    },
    {
      clave: 'acoso', icono: ShieldAlert,
      titulo: 'Línea ética', corto: 'Línea ética', desc: 'Reporta algo, de forma confidencial o anónima',
      href: '/autoservicio/juridica?vista=anti-acoso',
    },
    {
      clave: 'habeas', icono: Lock,
      titulo: 'Habeas data', corto: 'Habeas data', desc: 'Consulta o reclamo sobre tus datos',
      href: '/autoservicio/juridica?vista=habeas-data',
    },
    puedeAprobar && {
      clave: 'aprobaciones', icono: Inbox,
      titulo: 'Aprobaciones', corto: 'Aprobaciones', desc: 'Solicitudes de tu equipo',
      href: '/autoservicio/aprobaciones',
    },
  ].filter(Boolean) as Item[]

  return (
    <>
      {!activo && (
        <div className="mt-6 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3.5 text-sm text-amber-800 dark:text-amber-300">
          Tu vínculo laboral no está activo. Puedes consultar tu historial y descargar documentos,
          pero no crear solicitudes de vacaciones, permisos, licencias ni incapacidades.
        </div>
      )}

      <Seccion titulo="¿Qué necesitas solicitar?" items={solicitudes} onSolicitar={setSolicitar} />
      <Seccion titulo="Contratos y canales" items={canales} onSolicitar={setSolicitar} />

      {/* Se monta al abrir para que el formulario arranque limpio en cada trámite. */}
      {solicitar && <NuevaSolicitud tipoInicial={solicitar} saldoVacaciones={saldoVacaciones} onClose={() => setSolicitar(null)} />}
    </>
  )
}
