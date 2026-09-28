'use client'

import { useState } from 'react'
import {
  CalendarRange, Clock, IdCard, FileText, FolderUp, FileBadge, CalendarClock, HeartPulse,
  PenLine, Receipt, GraduationCap, Package, Scale, ShieldAlert, Lock, Inbox, Timer, ClockPlus, DoorOpen, ClipboardCheck,
} from 'lucide-react'
import { CarruselMovil, Casilla, CasillaCompacta, CarruselEscritorio } from '@/components/shell/carrusel-movil'
import { aplicaTramite, esOps, type Tramite } from '@/lib/tramites-vinculo'
import { NuevaSolicitud, type TipoSol } from './nueva-solicitud'

type Item = {
  clave: string
  icono: React.ElementType
  /** Título de escritorio ("Pedir vacaciones"). */
  titulo: string
  /** Título de móvil, corto ("Vacaciones"): el largo se parte feo bajo un ícono. */
  corto: string
  /** Estado real que exige atención ("1 pendiente"). */
  aviso?: string | null
  /** Trámite recién habilitado, para que la gente lo note. */
  nuevo?: boolean
  href?: string
  /** Abre el formulario de solicitud en vez de navegar. */
  sol?: TipoSol
}

/**
 * Una sección con la misma casilla (ícono y nombre) en un solo renglón que se
 * desliza si no caben todas: más grande en escritorio y compacta en el celular,
 * para que ninguna sección empuje hacia abajo la que viene después.
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
      <CarruselEscritorio>
        {items.map((i) => (
          <CasillaCompacta
            key={i.clave} grande
            icono={i.icono} titulo={i.titulo} aviso={i.aviso} nuevo={i.nuevo} href={i.href}
            onClick={i.sol ? () => onSolicitar(i.sol!) : undefined}
          />
        ))}
      </CarruselEscritorio>

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
  activo, tipoVinculo, fichaFaltantes, contratosPorFirmar, disciplinariosAbiertos, puedeAprobar, saldoVacaciones, mostrarSaldoVacaciones = false, bloqueoPermiso = null, documentosFaltantes, dotacionPorFirmar, horasExtraPorFirmar, retiroPorFirmar = 0, entregasPorVerificar = 0, esResponsableArea = false, hrefsNuevos = [],
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
  /** Si ya se le puede mostrar su saldo (historial de vacaciones cargado). */
  mostrarSaldoVacaciones?: boolean
  /** Permiso con comprobante vencido sin entregar: bloquea pedir otro (fechas formateadas). */
  bloqueoPermiso?: { fecha: string; vence: string } | null
  documentosFaltantes: number
  dotacionPorFirmar: number
  /** Órdenes de pago de horas extra (se pagan aparte de la nómina) esperando su firma. */
  horasExtraPorFirmar: number
  /** Documentos de su retiro (carta, acta, liquidación) esperando su firma. */
  retiroPorFirmar?: number
  /** Áreas del paz y salvo a su cargo pendientes de verificar (de otros que se retiran). */
  entregasPorVerificar?: number
  /** Es responsable de alguna área del paz y salvo (ve la casilla aunque no haya pendientes). */
  esResponsableArea?: boolean
  /** Rutas con un aviso de la plataforma vigente sin leer: su casilla muestra "Nuevo". */
  hrefsNuevos?: string[]
}) {
  const [solicitar, setSolicitar] = useState<TipoSol | null>(null)
  /** Atajo local: `aplica('vacaciones')` en vez de repetir el tipo de vínculo. */
  const aplica = (t: Tramite) => aplicaTramite(tipoVinculo, t)
  const ops = esOps(tipoVinculo)
  const plural = (n: number, s: string) => `${n} ${s}${n > 1 ? 's' : ''}`
  // Un aviso vigente sin leer que apunte a la casilla la marca como "Nuevo".
  const conNuevo = (items: Item[]) => items.map((i) => (i.href && hrefsNuevos.includes(i.href.split('?')[0]) ? { ...i, nuevo: true } : i))

  // Solo lo que de verdad es una SOLICITUD: algo que se manda y otra persona
  // aprueba o procesa (jefe, RRHH, o quien paga). Nada de consultar, firmar ni
  // completar datos propios: eso va abajo, en Canales.
  const solicitudes: Item[] = [
    // Trámites operativos: solo con vínculo activo.
    activo && aplica('vacaciones') && {
      clave: 'vacaciones', icono: CalendarRange,
      titulo: 'Pedir vacaciones', corto: 'Vacaciones',
      sol: 'VACACIONES' as TipoSol,
    },
    activo && aplica('permisos') && {
      clave: 'permiso', icono: Clock,
      titulo: 'Pedir permiso', corto: 'Permiso', sol: 'PERMISO' as TipoSol,
    },
    // Autorización para quedarse: antes, o hasta 3 días hábiles después.
    activo && aplica('horasExtra') && {
      clave: 'horas-extra-pedir', icono: ClockPlus,
      titulo: 'Pedir horas extra', corto: 'Horas extra', sol: 'HORAS_EXTRA' as TipoSol,
    },
    // La certificación laboral sigue disponible aunque esté retirado (habeas data).
    {
      clave: 'certificacion', icono: FileBadge,
      titulo: ops ? 'Pedir certificación contractual' : 'Pedir certificación', corto: 'Certificación',
      // En desarrollo: el trámite en sí (sol: 'CERTIFICACION_LABORAL') sigue intacto,
      // solo se desvía el acceso mientras se termina de habilitar.
      href: '/autoservicio/en-desarrollo?titulo=Pedir%20certificaci%C3%B3n',
    },
    activo && aplica('licencias') && {
      clave: 'licencia', icono: CalendarClock,
      titulo: 'Reportar licencia', corto: 'Licencia',
      // En desarrollo: el trámite (sol: 'LICENCIA') sigue intacto; solo se desvía el acceso.
      href: '/autoservicio/en-desarrollo?titulo=Reportar%20licencia',
    },
    activo && aplica('incapacidades') && {
      clave: 'incapacidad', icono: HeartPulse,
      titulo: 'Subir incapacidad', corto: 'Incapacidad',
      sol: 'INCAPACIDAD' as TipoSol,
    },
    // Se radica y se espera el pago: es una solicitud de plata, no una consulta.
    {
      clave: 'cuentas', icono: Receipt,
      titulo: 'Cobrar', corto: 'Cuenta de cobro',
      // En desarrollo: la pantalla real (/autoservicio/cuentas-cobro) sigue intacta,
      // solo se desvía el acceso mientras se termina de habilitar.
      href: '/autoservicio/en-desarrollo?titulo=Cuenta%20de%20cobro',
    },
  ].filter(Boolean) as Item[]

  // Todo lo demás: se consulta, tiene historial, o es un canal por el que se
  // llega a firmar o completar algo tuyo — pero no es un formulario que otro
  // aprueba.
  const canales: Item[] = [
    {
      clave: 'mi-info', icono: IdCard,
      titulo: 'Mi información', corto: 'Mi información',
      aviso: fichaFaltantes > 0 ? `${fichaFaltantes} por completar` : null,
      href: '/autoservicio/mi-informacion',
    },
    aplica('desprendibles') && {
      clave: 'desprendibles', icono: FileText,
      titulo: 'Descargar desprendibles', corto: 'Desprendibles',
      nuevo: true, href: '/autoservicio/desprendibles',
    },
    {
      clave: 'documentos', icono: FolderUp,
      titulo: 'Mis documentos', corto: 'Documentos',
      aviso: documentosFaltantes > 0 ? plural(documentosFaltantes, 'pendiente') : null,
      nuevo: true, href: '/autoservicio/documentos',
    },
    {
      clave: 'contratos', icono: PenLine,
      titulo: 'Firmar contrato', corto: 'Contrato',
      aviso: contratosPorFirmar > 0 ? plural(contratosPorFirmar, 'pendiente') : null,
      href: '/autoservicio/contratos',
    },
    // Se pagan aparte de la nómina: solo aparece cuando hay algo que ver.
    horasExtraPorFirmar > 0 && {
      clave: 'horas-extra', icono: Timer,
      titulo: 'Mis horas extra', corto: 'Horas extra',
      aviso: plural(horasExtraPorFirmar, 'por firmar'),
      href: '/autoservicio/horas-extra',
    },
    aplica('capacitaciones') && {
      clave: 'capacitaciones', icono: GraduationCap,
      titulo: 'Mis capacitaciones', corto: 'Capacitación',
      href: '/autoservicio/capacitaciones',
    },
    // Al OPS sí se le pueden entregar activos en custodia; dotación y EPP no.
    {
      clave: 'entregas', icono: Package,
      titulo: 'Mis entregas', corto: 'Mis entregas',
      aviso: dotacionPorFirmar > 0 ? `${dotacionPorFirmar} por firmar` : null,
      href: '/autoservicio/dotacion',
    },
    // El poder disciplinario sobre un contratista es el indicio más fuerte
    // de subordinación: no se le ofrece el módulo.
    aplica('disciplinarios') && {
      clave: 'disciplinarios', icono: Scale,
      titulo: 'Mis disciplinarios', corto: 'Disciplinarios',
      aviso: disciplinariosAbiertos > 0 ? plural(disciplinariosAbiertos, 'abierto') : null,
      href: '/autoservicio/disciplinarios',
    },
    {
      clave: 'acoso', icono: ShieldAlert,
      titulo: 'Línea ética', corto: 'Línea ética',
      href: '/autoservicio/juridica?vista=anti-acoso',
    },
    {
      clave: 'habeas', icono: Lock,
      titulo: 'Habeas data', corto: 'Habeas data',
      href: '/autoservicio/juridica?vista=habeas-data',
    },
    puedeAprobar && {
      clave: 'aprobaciones', icono: Inbox,
      titulo: 'Aprobaciones', corto: 'Aprobaciones',
      href: '/autoservicio/aprobaciones',
    },
    // Para los responsables de un área del paz y salvo: la entrega de quien se retira.
    (esResponsableArea || entregasPorVerificar > 0) && {
      clave: 'verificar-entregas', icono: ClipboardCheck,
      titulo: 'Verificar entregas', corto: 'Verificar',
      aviso: entregasPorVerificar > 0 ? plural(entregasPorVerificar, 'pendiente') : null,
      href: '/autoservicio/verificar-entregas',
    },
    // Renuncia, paz y salvo, liquidación y documentos de salida.
    {
      clave: 'retiro', icono: DoorOpen,
      titulo: 'Mi retiro', corto: 'Mi retiro',
      aviso: retiroPorFirmar > 0 ? `${retiroPorFirmar} por firmar` : null,
      href: '/autoservicio/retiro',
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

      <Seccion titulo="¿Qué necesitas solicitar?" items={conNuevo(solicitudes)} onSolicitar={setSolicitar} />
      <Seccion titulo="Canales" items={conNuevo(canales)} onSolicitar={setSolicitar} />

      {/* Se monta al abrir para que el formulario arranque limpio en cada trámite. */}
      {solicitar && <NuevaSolicitud tipoInicial={solicitar} saldoVacaciones={saldoVacaciones} mostrarSaldo={mostrarSaldoVacaciones} bloqueoPermiso={bloqueoPermiso} onClose={() => setSolicitar(null)} />}
    </>
  )
}
