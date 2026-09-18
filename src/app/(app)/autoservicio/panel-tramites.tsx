'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  CalendarRange, Clock, IdCard, FileText, FolderUp, FileBadge, CalendarClock, HeartPulse,
  PenLine, Receipt, GraduationCap, Package, Scale, ShieldAlert, Lock, Inbox, Timer,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { CarruselMovil, Casilla, CasillaCompacta } from '@/components/shell/carrusel-movil'
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
          <Casilla key={i.clave}>
            <CasillaCompacta
              icono={i.icono} titulo={i.corto} aviso={i.aviso} nuevo={i.nuevo} href={i.href}
              onClick={i.sol ? () => onSolicitar(i.sol!) : undefined}
            />
          </Casilla>
        ))}
      </CarruselMovil>
    </section>
  )
}


export function PanelTramites({
  activo, tipoVinculo, fichaFaltantes, contratosPorFirmar, disciplinariosAbiertos, puedeAprobar, saldoVacaciones, documentosFaltantes, dotacionPorFirmar, horasExtraPorFirmar,
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
  /** Órdenes de pago de horas extra (se pagan aparte de la nómina) esperando su firma. */
  horasExtraPorFirmar: number
}) {
  const [solicitar, setSolicitar] = useState<TipoSol | null>(null)
  /** Atajo local: `aplica('vacaciones')` en vez de repetir el tipo de vínculo. */
  const aplica = (t: Tramite) => aplicaTramite(tipoVinculo, t)
  const ops = esOps(tipoVinculo)
  const plural = (n: number, s: string) => `${n} ${s}${n > 1 ? 's' : ''}`

  // Solo lo que de verdad es una SOLICITUD: algo que se manda y otra persona
  // aprueba o procesa (jefe, RRHH, o quien paga). Nada de consultar, firmar ni
  // completar datos propios: eso va abajo, en Canales.
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
    // La certificación laboral sigue disponible aunque esté retirado (habeas data).
    {
      clave: 'certificacion', icono: FileBadge,
      titulo: ops ? 'Pedir certificación contractual' : 'Pedir certificación', corto: 'Certificación',
      desc: ops ? 'De tu contrato de prestación de servicios' : 'Laboral, con salario, para banco',
      // En desarrollo: el trámite en sí (sol: 'CERTIFICACION_LABORAL') sigue intacto,
      // solo se desvía el acceso mientras se termina de habilitar.
      href: '/autoservicio/en-desarrollo?titulo=Pedir%20certificaci%C3%B3n',
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
    // Se radica y se espera el pago: es una solicitud de plata, no una consulta.
    {
      clave: 'cuentas', icono: Receipt,
      titulo: 'Cobrar', corto: 'Cuenta de cobro',
      // En desarrollo: la pantalla real (/autoservicio/cuentas-cobro) sigue intacta,
      // solo se desvía el acceso mientras se termina de habilitar.
      desc: 'Servicios, comisiones o saldos a tu favor', href: '/autoservicio/en-desarrollo?titulo=Cuenta%20de%20cobro',
    },
  ].filter(Boolean) as Item[]

  // Todo lo demás: se consulta, tiene historial, o es un canal por el que se
  // llega a firmar o completar algo tuyo — pero no es un formulario que otro
  // aprueba.
  const canales: Item[] = [
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
    {
      clave: 'contratos', icono: PenLine,
      titulo: 'Firmar contrato', corto: 'Contrato', desc: 'Contrato y autorización de datos',
      aviso: contratosPorFirmar > 0 ? plural(contratosPorFirmar, 'pendiente') : null,
      href: '/autoservicio/contratos',
    },
    // Se pagan aparte de la nómina: solo aparece cuando hay algo que ver.
    horasExtraPorFirmar > 0 && {
      clave: 'horas-extra', icono: Timer,
      titulo: 'Mis horas extra', corto: 'Horas extra', desc: 'Firma la orden de pago',
      aviso: plural(horasExtraPorFirmar, 'por firmar'),
      href: '/autoservicio/horas-extra',
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
      <Seccion titulo="Canales" items={canales} onSolicitar={setSolicitar} />

      {/* Se monta al abrir para que el formulario arranque limpio en cada trámite. */}
      {solicitar && <NuevaSolicitud tipoInicial={solicitar} saldoVacaciones={saldoVacaciones} onClose={() => setSolicitar(null)} />}
    </>
  )
}
