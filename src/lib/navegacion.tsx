import {
  LayoutDashboard,
  Users,
  FileText,
  Wallet,
  CalendarClock,
  UserCog,
  Laptop,
  Scale,
  HeartPulse,
  ChartColumn,
  Settings,
  AlarmClock,
  CalendarCheck2,
  GraduationCap,
  ClipboardCheck,
  Cake,
  UserMinus,
  MailCheck,
  Clock,
  type LucideIcon,
} from 'lucide-react'
import type { Accion, ModuloClave } from '@/lib/permisos/modulos'
import { tienePermiso, type UsuarioSesion } from '@/lib/permisos/tipos'

export type ItemNav = {
  titulo: string
  href: string
  icono: LucideIcon
  modulo?: ModuloClave // si se omite, siempre visible
  accion?: Accion // acción requerida sobre el módulo (por defecto VER)
}

export type SeccionNav = {
  titulo: string
  items: ItemNav[]
}

export const SECCIONES: SeccionNav[] = [
  {
    titulo: 'General',
    items: [
      { titulo: 'Inicio', href: '/inicio', icono: LayoutDashboard },
      // La campana es de las notificaciones (barra superior); vencimientos lleva su propio ícono.
      { titulo: 'Vencimientos', href: '/vencimientos', icono: AlarmClock, modulo: 'vencimientos' },
    ],
  },
  {
    titulo: 'Talento Humano',
    items: [
      { titulo: 'Colaboradores', href: '/colaboradores', icono: Users, modulo: 'colaboradores' },
      { titulo: 'Contratación', href: '/contratos', icono: FileText, modulo: 'contratos' },
      { titulo: 'Nómina', href: '/nomina', icono: Wallet, modulo: 'nomina' },
      { titulo: 'Novedades', href: '/novedades', icono: CalendarClock, modulo: 'novedades' },
      { titulo: 'Horarios', href: '/horarios', icono: Clock, modulo: 'horarios' },
      { titulo: 'Activos y dotación', href: '/activos', icono: Laptop, modulo: 'activos' },
      { titulo: 'Capacitaciones', href: '/capacitaciones', icono: GraduationCap, modulo: 'capacitaciones' },
      { titulo: 'Evaluaciones', href: '/evaluaciones', icono: ClipboardCheck, modulo: 'evaluaciones' },
      { titulo: 'Cumpleaños', href: '/cumpleanos', icono: Cake, modulo: 'bienestar' },
      { titulo: 'Terminaciones', href: '/terminaciones', icono: UserMinus, modulo: 'terminaciones' },
    ],
  },
  {
    titulo: 'Cumplimiento',
    items: [
      { titulo: 'Jurídica', href: '/juridica', icono: Scale, modulo: 'juridica' },
      { titulo: 'Calendario legal', href: '/calendario-legal', icono: CalendarCheck2, modulo: 'calendario_legal' },
      { titulo: 'SST', href: '/sst', icono: HeartPulse, modulo: 'sst' },
    ],
  },
  {
    titulo: 'Mi espacio',
    items: [
      { titulo: 'Autoservicio', href: '/autoservicio', icono: UserCog, modulo: 'autoservicio' },
      // Bandeja de aprobaciones: solo para quien puede aprobar (jefes, TH, subgerencia).
      { titulo: 'Aprobaciones', href: '/autoservicio/aprobaciones', icono: MailCheck, modulo: 'autoservicio', accion: 'APROBAR' },
    ],
  },
  {
    titulo: 'Administración',
    items: [
      { titulo: 'Reportes', href: '/reportes', icono: ChartColumn, modulo: 'reportes' },
      { titulo: 'Configuración', href: '/configuracion', icono: Settings, modulo: 'configuracion' },
    ],
  },
]

function puedeVerItem(usuario: UsuarioSesion, item: ItemNav): boolean {
  return !item.modulo || tienePermiso(usuario, item.modulo, item.accion ?? 'VER')
}

export function seccionesVisibles(usuario: UsuarioSesion): SeccionNav[] {
  return SECCIONES.map((seccion) => ({
    ...seccion,
    items: seccion.items.filter((item) => puedeVerItem(usuario, item)),
  })).filter((seccion) => seccion.items.length > 0)
}

/**
 * Lista serializable de hrefs visibles para el usuario — se pasa desde el
 * layout (Server Component) a los componentes de navegación (Client), que
 * importan SECCIONES por su cuenta para obtener los iconos (no serializables).
 */
export function hrefsVisibles(usuario: UsuarioSesion): string[] {
  return SECCIONES.flatMap((s) => s.items)
    .filter((item) => puedeVerItem(usuario, item))
    .map((item) => item.href)
}

/** Secciones filtradas por un conjunto de hrefs visibles (uso en cliente). */
export function filtrarSecciones(visibles: string[]): SeccionNav[] {
  const set = new Set(visibles)
  return SECCIONES.map((seccion) => ({
    ...seccion,
    items: seccion.items.filter((item) => set.has(item.href)),
  })).filter((seccion) => seccion.items.length > 0)
}

/** Ítems de la barra inferior móvil filtrados por hrefs visibles (uso en cliente). */
/**
 * La barra de abajo del celular: la operación diaria, en este orden. Si el rol
 * no ve alguna, su lugar lo toma la siguiente de la lista (un empleado ve
 * Inicio y Autoservicio; un jefe, además, Aprobaciones). Caben cinco.
 */
const PRIORIDAD_MOVIL = ['/inicio', '/colaboradores', '/novedades', '/horarios', '/autoservicio/aprobaciones', '/autoservicio', '/nomina', '/vencimientos']

export function filtrarItemsMovil(visibles: string[]): ItemNav[] {
  const set = new Set(visibles)
  const items = SECCIONES.flatMap((s) => s.items)
  return PRIORIDAD_MOVIL
    .filter((href) => set.has(href))
    .map((href) => items.find((i) => i.href === href)!)
    .filter(Boolean)
    .slice(0, 5)
}
