'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  TreePalm, Clock, File, Stethoscope, FileCheck, Shield,
  Receipt, Landmark, ShieldAlert, Lock, Inbox, ChevronDown, CloudUpload, Shirt, GraduationCap, UserPen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { CHIP } from '@/components/ui-kit'
import { NuevaSolicitud, type TipoSol } from './nueva-solicitud'

type TileProps = {
  icono: React.ElementType
  color: keyof typeof CHIP
  /** Título de escritorio ("Pedir vacaciones"). */
  titulo: string
  /** Título de móvil, corto ("Vacaciones"): en dos columnas el largo se parte feo. */
  corto: string
  /** Solo escritorio: en móvil el ícono y el título ya bastan. */
  desc: string
  /** Estado real que exige atención ("1 pendiente"). */
  aviso?: string | null
  /** Trámite recién habilitado, para que la gente lo note. */
  nuevo?: boolean
  href?: string
  onClick?: () => void
  className?: string
}

function Tile({ icono: Icono, color, titulo, corto, desc, aviso, nuevo, href, onClick, className }: TileProps) {
  const contenido = (
    <>
      <span className={cn('mb-2 grid size-8 place-items-center rounded-[9px] sm:mb-2.5 sm:size-9', CHIP[color])}>
        <Icono className="size-4 sm:size-[18px]" />
      </span>
      <span className="block text-[12.5px] font-semibold leading-tight sm:text-[13px]">
        <span className="sm:hidden">{corto}</span>
        <span className="hidden sm:inline">{titulo}</span>
      </span>
      <span className="mt-0.5 hidden text-[11px] leading-snug text-muted-foreground sm:block">{desc}</span>
      {aviso && (
        <span className="mt-2 inline-block rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">
          {aviso}
        </span>
      )}
      {!aviso && nuevo && (
        <span className="mt-2 inline-block rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
          Nuevo
        </span>
      )}
    </>
  )
  const clases = cn(
    'rounded-xl border bg-card p-3 text-left transition-all sm:p-3.5',
    'hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    className,
  )
  return href
    ? <Link href={href} className={clases}>{contenido}</Link>
    : <button type="button" onClick={onClick} className={clases}>{contenido}</button>
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2.5 text-[13px] font-bold">{titulo}</h2>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">{children}</div>
    </section>
  )
}

export function PanelTramites({
  activo, fichaFaltantes, contratosPorFirmar, disciplinariosAbiertos, puedeAprobar, saldoVacaciones, documentosFaltantes, dotacionPorFirmar,
}: {
  /** Colaborador con vínculo activo: solo entonces se ofrecen los trámites operativos. */
  activo: boolean
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
  // Móvil: los 4 trámites frecuentes primero; el resto tras "Ver todos los trámites".
  // En escritorio hay espacio para mostrarlo todo de una vez.
  const [verTodo, setVerTodo] = useState(false)
  /** Oculto en móvil hasta desplegar; en escritorio siempre visible. */
  const tras = cn(!verTodo && 'hidden sm:block')

  return (
    <>
      {!activo && (
        <div className="mt-6 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3.5 text-sm text-amber-800 dark:text-amber-300">
          Tu vínculo laboral no está activo. Puedes consultar tu historial y descargar documentos,
          pero no crear solicitudes de vacaciones, permisos, licencias ni incapacidades.
        </div>
      )}

      <Seccion titulo="¿Qué necesitas solicitar?">
        {/* Trámites operativos: solo con vínculo activo. */}
        {activo && (
          <Tile icono={TreePalm} color="emerald" titulo="Pedir vacaciones" corto="Vacaciones"
            desc="Tu jefe y RRHH aprueban las fechas" onClick={() => setSolicitar('VACACIONES')} />
        )}
        {activo && (
          <Tile icono={Clock} color="sky" titulo="Pedir permiso" corto="Permiso"
            desc="Por día o por horas" onClick={() => setSolicitar('PERMISO')} />
        )}
        <Tile icono={UserPen} color="violet" titulo="Mi información" corto="Mi información"
          desc="Completa tus datos, banco y emergencia"
          aviso={fichaFaltantes > 0 ? `${fichaFaltantes} por completar` : null}
          href="/autoservicio/mi-informacion" />
        <Tile icono={FileCheck} color="ink" titulo="Descargar desprendibles" corto="Desprendibles"
          desc="Todos tus pagos en PDF" nuevo href="/autoservicio/desprendibles" />
        <Tile icono={CloudUpload} color="indigo" titulo="Mis documentos" corto="Documentos"
          desc="Sube cédula, diplomas, certificados…"
          aviso={documentosFaltantes > 0 ? `${documentosFaltantes} pendiente${documentosFaltantes > 1 ? 's' : ''}` : null}
          nuevo href="/autoservicio/documentos" />
        {/* La certificación laboral sigue disponible aunque esté retirado (habeas data). */}
        <Tile icono={File} color="teal" titulo="Pedir certificación" corto="Certificación"
          desc="Laboral, con salario, para banco" onClick={() => setSolicitar('CERTIFICACION_LABORAL')} />
        {activo && (
          <Tile icono={File} color="violet" titulo="Reportar licencia" corto="Licencia"
            desc="Maternidad, luto, estudio…" nuevo onClick={() => setSolicitar('LICENCIA')} className={tras} />
        )}
        {activo && (
          <Tile icono={Stethoscope} color="rose" titulo="Subir incapacidad" corto="Incapacidad"
            desc="RRHH la valida y registra" onClick={() => setSolicitar('INCAPACIDAD')} className={tras} />
        )}
      </Seccion>

      <div className={tras}>
        <Seccion titulo="Contratos y canales">
          <Tile icono={Shield} color="amber" titulo="Firmar contrato" corto="Firmar contrato"
            desc="Contrato y autorización de datos"
            aviso={contratosPorFirmar > 0 ? `${contratosPorFirmar} pendiente${contratosPorFirmar > 1 ? 's' : ''}` : null}
            href="/autoservicio/contratos" />
          {/* No es solo de OPS: cualquier colaborador cobra comisiones o saldos a su favor.
              Si tiene contrato OPS activo, la cuenta se vincula y exige verificar la
              seguridad social; si no, se radica igual. Ver `crearMiCuentaCobro`. */}
          <Tile icono={Receipt} color="teal" titulo="Cuenta de cobro" corto="Cuenta de cobro"
            desc="Servicios, comisiones o saldos a tu favor" href="/autoservicio/cuentas-cobro" />
          <Tile icono={GraduationCap} color="violet" titulo="Mis capacitaciones" corto="Capacitaciones"
            desc="Tu historial de formación y notas" href="/autoservicio/capacitaciones" />
          <Tile icono={Shirt} color="indigo" titulo="Mis entregas" corto="Mis entregas"
            desc="Activos, dotación y EPP con su recibido"
            aviso={dotacionPorFirmar > 0 ? `${dotacionPorFirmar} por firmar` : null}
            href="/autoservicio/dotacion" />
          <Tile icono={Landmark} color="ink" titulo="Mis disciplinarios" corto="Disciplinarios"
            desc="Presentar descargos o apelar"
            aviso={disciplinariosAbiertos > 0 ? `${disciplinariosAbiertos} abierto${disciplinariosAbiertos > 1 ? 's' : ''}` : null}
            href="/autoservicio/disciplinarios" />
          <Tile icono={ShieldAlert} color="rose" titulo="Canal anti-acoso" corto="Canal anti-acoso"
            desc="Denuncia confidencial o anónima" href="/autoservicio/juridica?vista=anti-acoso" />
          <Tile icono={Lock} color="indigo" titulo="Habeas data" corto="Habeas data"
            desc="Consulta o reclamo sobre tus datos" href="/autoservicio/juridica?vista=habeas-data" />
          {puedeAprobar && (
            <Tile icono={Inbox} color="violet" titulo="Aprobaciones" corto="Aprobaciones"
              desc="Solicitudes de tu equipo" href="/autoservicio/aprobaciones" />
          )}
        </Seccion>
      </div>

      <button
        type="button"
        onClick={() => setVerTodo((v) => !v)}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border bg-card p-2.5 text-[12.5px] font-semibold transition-colors hover:bg-accent sm:hidden"
      >
        {verTodo ? 'Ver menos' : 'Ver todos los trámites'}
        <ChevronDown className={cn('size-3.5 transition-transform', verTodo && 'rotate-180')} />
      </button>

      {/* Se monta al abrir para que el formulario arranque limpio en cada trámite. */}
      {solicitar && <NuevaSolicitud tipoInicial={solicitar} saldoVacaciones={saldoVacaciones} onClose={() => setSolicitar(null)} />}
    </>
  )
}
