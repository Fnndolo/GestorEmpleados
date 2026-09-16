import Link from 'next/link'
import { requerirSesion, tienePermiso } from '@/server/sesion'
import { hrefsVisibles } from '@/lib/navegacion'
import { prisma } from '@/lib/db'
import { Card, CardContent } from '@/components/ui/card'
import { Users, Building2, Bell, ShieldCheck, AlertCircle, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { hoyBogota, formatFechaCorta } from '@/lib/fechas'
import { BannerPush } from '@/components/pwa/banner-push'
import { ModulosInicio } from './modulos-inicio'

export const metadata = { title: 'Inicio · Smart Gadgets RH' }


export default async function InicioPage() {
  const usuario = await requerirSesion()

  const verVencimientos = tienePermiso(usuario, 'vencimientos', 'VER')
  const puedeAprobar = tienePermiso(usuario, 'autoservicio', 'APROBAR')
  // Las cifras de administración (usuarios, roles, sedes) son de quien administra:
  // a un empleado no le dicen nada y le enseñan de más. Se muestran con el mismo
  // permiso que abre la pantalla de donde salen.
  const verUsuarios = tienePermiso(usuario, 'usuarios', 'VER')
  const verConfiguracion = tienePermiso(usuario, 'configuracion', 'VER')
  const hoy = hoyBogota()
  const en30 = new Date(hoy); en30.setUTCDate(en30.getUTCDate() + 30)

  const [sedes, usuarios, roles, vencimientos, solicitudesPendientes] = await Promise.all([
    verConfiguracion ? prisma.sede.count({ where: { activa: true } }) : Promise.resolve(0),
    verUsuarios ? prisma.user.count({ where: { estado: 'ACTIVO' } }) : Promise.resolve(0),
    verConfiguracion && !verVencimientos ? prisma.rol.count() : Promise.resolve(0),
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

  // Una sola línea, y solo cuando hay vencimientos que atender: sin nada que
  // avisar no se rellena con la fecha ni con el rol de la sesión.
  const pendiente = vencidos > 0
    ? `Tienes ${vencidos} vencimiento${vencidos > 1 ? 's' : ''} vencido${vencidos > 1 ? 's' : ''}${proximos > 0 ? ` y ${proximos} por atender` : ''}`
    : proximos > 0
      ? `Tienes ${proximos} vencimiento${proximos > 1 ? 's' : ''} por atender este mes`
      : null

  // Cada indicador va con su permiso; a quien no le toca ninguno, no ve la fila.
  // Solo el de vencimientos cambia de color, y solo cuando hay vencidos: es un estado, no una categoría.
  const indicadores: { icono: LucideIcon; alerta?: boolean; valor: string; label: string }[] = []
  if (verUsuarios) indicadores.push({ icono: Users, valor: String(usuarios), label: 'Usuarios activos' })
  if (verConfiguracion) indicadores.push({ icono: Building2, valor: String(sedes), label: 'Sedes activas' })
  if (verVencimientos) {
    indicadores.push({ icono: Bell, alerta: vencidos > 0, valor: String(vencimientos.length), label: 'Vencimientos próximos' })
  } else if (verConfiguracion) {
    indicadores.push({ icono: ShieldCheck, valor: String(roles), label: 'Roles configurados' })
  }

  return (
    <div className="max-w-7xl">
      {/* El saludo va en la barra superior (ver layout); aquí solo lo que
          exige acción hoy, si lo hay. */}
      {pendiente && (
        <p className="text-sm font-semibold">
          <Link href="/vencimientos" className="hover:underline">{pendiente}</Link>
        </p>
      )}

      {/* El aviso vive solo aquí: en el resto de pantallas empujaba el contenido
          hacia abajo y se llevaba por delante los encabezados fijos. */}
      <BannerPush />

      {indicadores.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {indicadores.map((ind, i) => (
            <Stat
              key={ind.label}
              {...ind}
              // El último de una fila impar ocupa las dos columnas en móvil para no dejar hueco.
              className={i === indicadores.length - 1 && indicadores.length % 2 === 1 ? 'col-span-2 sm:col-span-1' : undefined}
            />
          ))}
        </div>
      )}

      {/* Módulos: cuadrícula en escritorio y carrusel por sección en el
          celular, el mismo diseño del autoservicio. Solo se pasan datos
          serializables; los iconos los resuelve el componente cliente. */}
      <ModulosInicio
        hrefsVisibles={hrefsVisibles(usuario)}
        avisos={{
          ...(vencidos > 0 ? { '/vencimientos': { texto: `${vencidos} vencido${vencidos > 1 ? 's' : ''}`, tono: 'bad' as const } } : {}),
          ...(porAprobar > 0 ? { '/autoservicio/aprobaciones': { texto: `${porAprobar} pendiente${porAprobar > 1 ? 's' : ''}`, tono: 'warn' as const } } : {}),
        }}
      />

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
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-foreground text-background">
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

function Stat({ icono: Icono, alerta, valor, label, className }: {
  icono: LucideIcon; alerta?: boolean; valor: string; label: string; className?: string
}) {
  return (
    <div className={cn('flex items-center gap-3 rounded-xl border bg-card p-3.5', className)}>
      <span className={cn(
        'grid size-9 shrink-0 place-items-center rounded-[10px]',
        alerta ? 'bg-rose-500/12 text-rose-600 dark:text-rose-400' : 'bg-foreground text-background',
      )}>
        <Icono className="size-[19px]" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[22px] font-bold leading-none tracking-tight tabular-nums">{valor}</p>
        <p className="mt-1 text-[11.5px] text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

