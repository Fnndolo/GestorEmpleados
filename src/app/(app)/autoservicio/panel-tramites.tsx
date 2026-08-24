'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  TreePalm, Clock, File, Stethoscope, FileCheck, Shield,
  Receipt, Landmark, ShieldAlert, Lock, Inbox, CloudUpload, Shirt, GraduationCap, UserPen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { aplicaTramite, esOps, type Tramite } from '@/lib/tramites-vinculo'
import { CHIP } from '@/components/ui-kit'
import { NuevaSolicitud, type TipoSol } from './nueva-solicitud'

type Item = {
  clave: string
  icono: React.ElementType
  color: keyof typeof CHIP
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
  const { icono: Icono, color, titulo, desc, aviso, nuevo } = item
  const contenido = (
    <>
      <span className={cn('mb-2.5 grid size-9 place-items-center rounded-[9px]', CHIP[color])}>
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
  const { icono: Icono, color, corto, aviso, nuevo } = item
  const contenido = (
    <>
      <span className="relative">
        <span className={cn('grid size-14 place-items-center rounded-2xl border bg-card', 'transition-colors group-active/t:bg-accent')}>
          <span className={cn('grid size-8 place-items-center rounded-[10px]', CHIP[color])}>
            <Icono className="size-4" />
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
      <span className="mt-1.5 block w-[72px] text-center text-[11px] font-medium leading-tight">{corto}</span>
    </>
  )
  const clases = 'group/t flex shrink-0 flex-col items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-2xl'
  return item.href
    ? <Link href={item.href} className={clases}>{contenido}</Link>
    : <button type="button" onClick={() => item.sol && onSolicitar(item.sol)} className={clases}>{contenido}</button>
}

/**
 * Una sección con sus dos caras: cuadrícula con descripciones en escritorio y,
 * en móvil, íconos pequeños. Los de solicitar van en carrusel horizontal para
 * que no empujen hacia abajo lo que viene después.
 */
function Seccion({
  titulo, items, carrusel, onSolicitar,
}: {
  titulo: string
  items: Item[]
  /** Móvil: en fila deslizable en vez de cuadrícula. */
  carrusel?: boolean
  onSolicitar: (t: TipoSol) => void
}) {
  if (items.length === 0) return null
  return (
    <section className="mt-6">
      <h2 className="mb-2.5 text-[13px] font-bold">{titulo}</h2>

      {/* Escritorio */}
      <div className="hidden gap-2.5 sm:grid sm:grid-cols-3 lg:grid-cols-4">
        {items.map((i) => <Tile key={i.clave} item={i} onSolicitar={onSolicitar} />)}
      </div>

      {/* Móvil */}
      <div
        className={cn(
          'sm:hidden',
          carrusel
            // Se sale del margen del contenido para que el carrusel llegue al
            // borde de la pantalla y se note que hay más hacia la derecha.
            ? '-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
            : 'grid grid-cols-4 justify-items-center gap-x-2 gap-y-3',
        )}
      >
        {items.map((i) => (
          <div key={i.clave} className={cn(carrusel && 'snap-start')}>
            <TileCompacto item={i} onSolicitar={onSolicitar} />
          </div>
        ))}
      </div>
    </section>
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
      clave: 'vacaciones', icono: TreePalm, color: 'emerald' as const,
      titulo: 'Pedir vacaciones', corto: 'Vacaciones', desc: 'Tu jefe y RRHH aprueban las fechas',
      sol: 'VACACIONES' as TipoSol,
    },
    activo && aplica('permisos') && {
      clave: 'permiso', icono: Clock, color: 'sky' as const,
      titulo: 'Pedir permiso', corto: 'Permiso', desc: 'Por día o por horas', sol: 'PERMISO' as TipoSol,
    },
    {
      clave: 'mi-info', icono: UserPen, color: 'violet' as const,
      titulo: 'Mi información', corto: 'Mi información', desc: 'Completa tus datos, banco y emergencia',
      aviso: fichaFaltantes > 0 ? `${fichaFaltantes} por completar` : null,
      href: '/autoservicio/mi-informacion',
    },
    aplica('desprendibles') && {
      clave: 'desprendibles', icono: FileCheck, color: 'ink' as const,
      titulo: 'Descargar desprendibles', corto: 'Desprendibles', desc: 'Todos tus pagos en PDF',
      nuevo: true, href: '/autoservicio/desprendibles',
    },
    {
      clave: 'documentos', icono: CloudUpload, color: 'indigo' as const,
      titulo: 'Mis documentos', corto: 'Documentos', desc: 'Sube cédula, diplomas, certificados…',
      aviso: documentosFaltantes > 0 ? plural(documentosFaltantes, 'pendiente') : null,
      nuevo: true, href: '/autoservicio/documentos',
    },
    // La certificación laboral sigue disponible aunque esté retirado (habeas data).
    {
      clave: 'certificacion', icono: File, color: 'teal' as const,
      titulo: ops ? 'Pedir certificación contractual' : 'Pedir certificación', corto: 'Certificación',
      desc: ops ? 'De tu contrato de prestación de servicios' : 'Laboral, con salario, para banco',
      sol: 'CERTIFICACION_LABORAL' as TipoSol,
    },
    activo && aplica('licencias') && {
      clave: 'licencia', icono: File, color: 'violet' as const,
      titulo: 'Reportar licencia', corto: 'Licencia', desc: 'Maternidad, luto, estudio…',
      nuevo: true, sol: 'LICENCIA' as TipoSol,
    },
    activo && aplica('incapacidades') && {
      clave: 'incapacidad', icono: Stethoscope, color: 'rose' as const,
      titulo: 'Subir incapacidad', corto: 'Incapacidad', desc: 'RRHH la valida y registra',
      sol: 'INCAPACIDAD' as TipoSol,
    },
  ].filter(Boolean) as Item[]

  const canales: Item[] = [
    {
      clave: 'contratos', icono: Shield, color: 'amber' as const,
      titulo: 'Firmar contrato', corto: 'Contrato', desc: 'Contrato y autorización de datos',
      aviso: contratosPorFirmar > 0 ? plural(contratosPorFirmar, 'pendiente') : null,
      href: '/autoservicio/contratos',
    },
    // No es solo de OPS: cualquier colaborador cobra comisiones o saldos a su favor.
    // Si tiene contrato OPS activo, la cuenta se vincula y exige verificar la
    // seguridad social; si no, se radica igual. Ver `crearMiCuentaCobro`.
    {
      clave: 'cuentas', icono: Receipt, color: 'teal' as const,
      titulo: 'Cuenta de cobro', corto: 'Cuenta de cobro',
      desc: 'Servicios, comisiones o saldos a tu favor', href: '/autoservicio/cuentas-cobro',
    },
    aplica('capacitaciones') && {
      clave: 'capacitaciones', icono: GraduationCap, color: 'violet' as const,
      titulo: 'Mis capacitaciones', corto: 'Capacitaciones', desc: 'Tu historial de formación y notas',
      href: '/autoservicio/capacitaciones',
    },
    // Al OPS sí se le pueden entregar activos en custodia; dotación y EPP no.
    {
      clave: 'entregas', icono: Shirt, color: 'indigo' as const,
      titulo: 'Mis entregas', corto: 'Mis entregas',
      desc: ops ? 'Activos a tu cargo con su acta' : 'Activos, dotación y EPP con su recibido',
      aviso: dotacionPorFirmar > 0 ? `${dotacionPorFirmar} por firmar` : null,
      href: '/autoservicio/dotacion',
    },
    // El poder disciplinario sobre un contratista es el indicio más fuerte
    // de subordinación: no se le ofrece el módulo.
    aplica('disciplinarios') && {
      clave: 'disciplinarios', icono: Landmark, color: 'ink' as const,
      titulo: 'Mis disciplinarios', corto: 'Disciplinarios', desc: 'Presentar descargos o apelar',
      aviso: disciplinariosAbiertos > 0 ? plural(disciplinariosAbiertos, 'abierto') : null,
      href: '/autoservicio/disciplinarios',
    },
    {
      clave: 'acoso', icono: ShieldAlert, color: 'rose' as const,
      titulo: 'Canal anti-acoso', corto: 'Anti-acoso', desc: 'Denuncia confidencial o anónima',
      href: '/autoservicio/juridica?vista=anti-acoso',
    },
    {
      clave: 'habeas', icono: Lock, color: 'indigo' as const,
      titulo: 'Habeas data', corto: 'Habeas data', desc: 'Consulta o reclamo sobre tus datos',
      href: '/autoservicio/juridica?vista=habeas-data',
    },
    puedeAprobar && {
      clave: 'aprobaciones', icono: Inbox, color: 'violet' as const,
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

      <Seccion titulo="¿Qué necesitas solicitar?" items={solicitudes} carrusel onSolicitar={setSolicitar} />
      <Seccion titulo="Contratos y canales" items={canales} onSolicitar={setSolicitar} />

      {/* Se monta al abrir para que el formulario arranque limpio en cada trámite. */}
      {solicitar && <NuevaSolicitud tipoInicial={solicitar} saldoVacaciones={saldoVacaciones} onClose={() => setSolicitar(null)} />}
    </>
  )
}
