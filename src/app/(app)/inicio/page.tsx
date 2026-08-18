import Link from 'next/link'
import { requerirSesion, tienePermiso } from '@/server/sesion'
import { seccionesVisibles } from '@/lib/navegacion'
import { prisma } from '@/lib/db'
import { Card, CardContent } from '@/components/ui/card'
import { Users, Building2, Bell, ShieldCheck, AlertCircle, Inbox, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CHIP, type ChipColor } from '@/components/ui-kit'
import { hoyBogota, formatFechaCorta, formatFechaLarga } from '@/lib/fechas'
import { BannerPush } from '@/components/pwa/banner-push'

export const metadata = { title: 'Inicio · Smart Gadgets RH' }


/** Color y descripción por módulo: el color distingue, la descripción orienta. */
const MODULO: Record<string, { color: ChipColor; desc: string }> = {
  '/vencimientos': { color: 'amber', desc: 'Alertas de contratos, exámenes y cursos' },
  '/colaboradores': { color: 'sky', desc: 'Fichas, documentos y organigrama' },
  '/contratos': { color: 'teal', desc: 'OPS, cuentas de cobro y firmas' },
  '/nomina': { color: 'emerald', desc: 'Periodos, liquidación y desprendibles' },
  '/novedades': { color: 'amber', desc: 'Ausencias, horas extra y ajustes' },
  '/activos': { color: 'ink', desc: 'Equipos y dotación entregada' },
  '/capacitaciones': { color: 'violet', desc: 'Cursos y asistencia del personal' },
  '/evaluaciones': { color: 'indigo', desc: 'Desempeño y periodo de prueba' },
  '/terminaciones': { color: 'rose', desc: 'Retiros y liquidación final' },
  '/juridica': { color: 'violet', desc: 'Disciplinarios, anti-acoso y habeas data' },
  '/calendario-legal': { color: 'teal', desc: 'Obligaciones y fechas legales' },
  '/sst': { color: 'rose', desc: 'Seguridad y salud en el trabajo' },
  '/autoservicio': { color: 'indigo', desc: 'Tus vacaciones, permisos y certificados' },
  '/reportes': { color: 'sky', desc: 'Indicadores y exportes' },
  '/configuracion': { color: 'ink', desc: 'Empresa, sedes, cargos y roles' },
}

export default async function InicioPage() {
  const usuario = await requerirSesion()
  const secciones = seccionesVisibles(usuario)

  const verVencimientos = tienePermiso(usuario, 'vencimientos', 'VER')
  const puedeAprobar = tienePermiso(usuario, 'autoservicio', 'APROBAR')
  const hoy = hoyBogota()
  const en30 = new Date(hoy); en30.setUTCDate(en30.getUTCDate() + 30)

  const [sedes, usuarios, roles, vencimientos, solicitudesPendientes] = await Promise.all([
    prisma.sede.count({ where: { activa: true } }),
    prisma.user.count({ where: { estado: 'ACTIVO' } }),
    prisma.rol.count(),
    verVencimientos
      ? prisma.vencimiento.findMany({
          where: { estado: { notIn: ['RESUELTO', 'CANCELADO'] }, fechaVencimiento: { lte: en30 } },
          orderBy: { fechaVencimiento: 'asc' },
          take: 6,
        })
      : Promise.resolve([]),
    puedeAprobar
      ? prisma.solicitud.findMany({
          where: { estado: 'EN_APROBACION', pasos: { some: { estado: 'PENDIENTE' } } },
          include: {
            pasos: { orderBy: { orden: 'asc' as const } },
            colaborador: { select: { jefeInmediatoId: true } },
          },
        })
      : Promise.resolve([]),
  ])

  // Mismo filtro que la bandeja de aprobaciones: solo las que este usuario puede resolver.
  const esAdminRrhh = ['Administrador', 'Recursos Humanos', 'Subgerencia'].includes(usuario.rolNombre)
  const porAprobar = solicitudesPendientes.filter((s) => {
    const paso = s.pasos.find((p) => p.estado === 'PENDIENTE')
    if (!paso) return false
    if (esAdminRrhh) return true
    if (paso.usaJefeInmediato) return usuario.colaboradorId === s.colaborador.jefeInmediatoId
    return paso.rolAprobador === usuario.rolNombre
  }).length

  const vencidos = vencimientos.filter((v) => v.fechaVencimiento < hoy).length
  const proximos = vencimientos.length - vencidos

  // El saludo dice lo que exige acción hoy; si no hay nada, no inventa urgencia.
  const pendiente = vencidos > 0
    ? `tienes ${vencidos} vencimiento${vencidos > 1 ? 's' : ''} vencido${vencidos > 1 ? 's' : ''}${proximos > 0 ? ` y ${proximos} por atender` : ''}`
    : proximos > 0
      ? `tienes ${proximos} vencimiento${proximos > 1 ? 's' : ''} por atender este mes`
      : verVencimientos
        ? 'no tienes vencimientos por atender'
        : `sesión activa como ${usuario.rolNombre}`

  return (
    <div className="max-w-7xl">
      <h1 className="text-xl font-bold tracking-tight">{darSaludo()}, {usuario.nombre.split(' ')[0]}</h1>
      <p className="mt-0.5 text-[13px] text-muted-foreground">
        <span className="capitalize">{formatFechaLarga(hoy)}</span> · {pendiente}
      </p>

      {/* El aviso vive solo aquí: en el resto de pantallas empujaba el contenido
          hacia abajo y se llevaba por delante los encabezados fijos. */}
      <BannerPush />

      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <Stat icono={Users} color="sky" valor={String(usuarios)} label="Usuarios activos" />
        <Stat icono={Building2} color="ink" valor={String(sedes)} label="Sedes activas" />
        {verVencimientos ? (
          <Stat icono={Bell} color={vencidos > 0 ? 'rose' : 'amber'} valor={String(vencimientos.length)}
            label="Vencimientos próximos" className="col-span-2 sm:col-span-1" />
        ) : (
          <Stat icono={ShieldCheck} color="emerald" valor={String(roles)}
            label="Roles configurados" className="col-span-2 sm:col-span-1" />
        )}
      </div>

      {secciones.map((seccion) => {
        const items = seccion.items.filter((i) => i.href !== '/inicio')
        // "General" también aloja Aprobaciones para quien puede aprobar solicitudes.
        const conAprobaciones = seccion.titulo === 'General' && puedeAprobar
        if (items.length === 0 && !conAprobaciones) return null
        return (
          <section key={seccion.titulo} className="mt-6">
            <h2 className="mb-2.5 text-[13px] font-bold">{seccion.titulo}</h2>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((item) => {
                const Icono = item.icono
                const meta = MODULO[item.href] ?? { color: 'ink' as ChipColor, desc: '' }
                const aviso = item.href === '/vencimientos' && vencidos > 0
                  ? `${vencidos} vencido${vencidos > 1 ? 's' : ''}`
                  : null
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'rounded-xl border bg-card p-3 text-left transition-all sm:p-3.5',
                      'hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    )}
                  >
                    <span className={cn('mb-2 grid size-8 place-items-center rounded-[9px] sm:mb-2.5 sm:size-9', CHIP[meta.color])}>
                      <Icono className="size-4 sm:size-[18px]" />
                    </span>
                    <span className="block text-[12.5px] font-semibold leading-tight sm:text-[13px]">{item.titulo}</span>
                    {meta.desc && (
                      <span className="mt-0.5 hidden text-[11px] leading-snug text-muted-foreground sm:block">{meta.desc}</span>
                    )}
                    {aviso && (
                      <span className="mt-2 inline-block rounded-full bg-rose-500/12 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 dark:text-rose-400">
                        {aviso}
                      </span>
                    )}
                  </Link>
                )
              })}
              {conAprobaciones && (
                <Link
                  href="/autoservicio/aprobaciones"
                  className={cn(
                    'rounded-xl border bg-card p-3 text-left transition-all sm:p-3.5',
                    'hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  )}
                >
                  <span className={cn('mb-2 grid size-8 place-items-center rounded-[9px] sm:mb-2.5 sm:size-9', CHIP.violet)}>
                    <Inbox className="size-4 sm:size-[18px]" />
                  </span>
                  <span className="block text-[12.5px] font-semibold leading-tight sm:text-[13px]">Aprobaciones</span>
                  <span className="mt-0.5 hidden text-[11px] leading-snug text-muted-foreground sm:block">Solicitudes de tu equipo por aprobar</span>
                  {porAprobar > 0 && (
                    <span className="mt-2 inline-block rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                      {porAprobar} pendiente{porAprobar > 1 ? 's' : ''}
                    </span>
                  )}
                </Link>
              )}
            </div>
          </section>
        )
      })}

      {verVencimientos && vencimientos.length > 0 && (
        <section className="mt-8">
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-[13px] font-bold">Requiere tu atención</h2>
            <Link href="/vencimientos" className="text-xs text-primary hover:underline">Ver todos</Link>
          </div>
          <Card><CardContent className="divide-y p-0">
            {vencimientos.map((v) => {
              const vencido = v.fechaVencimiento < hoy
              const dias = Math.round((v.fechaVencimiento.getTime() - hoy.getTime()) / 86_400_000)
              return (
                <div key={v.id} className="flex items-center gap-3 p-3">
                  <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', vencido ? CHIP.rose : CHIP.amber)}>
                    {vencido ? <AlertCircle className="size-4" /> : <Bell className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{v.titulo}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {vencido ? 'Venció el' : 'Vence el'} {formatFechaCorta(v.fechaVencimiento)}
                    </p>
                  </div>
                  <span className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold',
                    vencido
                      ? 'bg-rose-500/12 text-rose-700 dark:text-rose-400'
                      : 'bg-amber-500/12 text-amber-700 dark:text-amber-400',
                  )}>
                    {vencido ? 'Vencido' : dias === 0 ? 'Hoy' : `En ${dias} día${dias > 1 ? 's' : ''}`}
                  </span>
                </div>
              )
            })}
          </CardContent></Card>
        </section>
      )}
    </div>
  )
}

function Stat({ icono: Icono, color, valor, label, className }: {
  icono: LucideIcon; color: ChipColor; valor: string; label: string; className?: string
}) {
  return (
    <div className={cn('flex items-center gap-3 rounded-xl border bg-card p-3.5', className)}>
      <span className={cn('grid size-9 shrink-0 place-items-center rounded-[10px]', CHIP[color])}>
        <Icono className="size-[19px]" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[22px] font-bold leading-none tracking-tight tabular-nums">{valor}</p>
        <p className="mt-1 text-[11.5px] text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

function darSaludo(): string {
  const hora = Number(
    new Date().toLocaleString('en-US', { timeZone: 'America/Bogota', hour: 'numeric', hour12: false }),
  )
  if (hora < 12) return 'Buenos días'
  if (hora < 19) return 'Buenas tardes'
  return 'Buenas noches'
}
