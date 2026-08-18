import Link from 'next/link'
import { requerirPermiso } from '@/server/sesion'
import { tienePermiso } from '@/server/sesion'
import { Encabezado } from '@/components/shell/encabezado'
import { Building2, Users, ShieldCheck, MapPin, Bell, BellRing, FileStack, Layers, Receipt, Briefcase, Coins, Landmark, Network } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CHIP, Chip, type ChipColor } from '@/components/ui-kit'

export const metadata = { title: 'Configuración · Smart Gadgets RH' }

const SECCIONES: { titulo: string; desc: string; href: string; icono: typeof Building2; color: ChipColor; modulo: 'configuracion' | 'usuarios' }[] = [
  { titulo: 'Empresa', desc: 'Razón social, NIT, representante legal y parámetros generales.', href: '/configuracion/empresa', icono: Building2, color: 'ink', modulo: 'configuracion' },
  { titulo: 'Sedes y ciudades', desc: 'Administra las sedes y ciudades donde opera la empresa.', href: '/configuracion/sedes', icono: MapPin, color: 'teal', modulo: 'configuracion' },
  { titulo: 'Áreas', desc: 'Estructura organizativa: áreas, de quién dependen y quién responde por cada una. Van antes que los cargos.', href: '/configuracion/areas', icono: Network, color: 'violet', modulo: 'configuracion' },
  { titulo: 'Cargos', desc: 'Crea y edita los cargos; los cambios se reflejan en quienes los tienen asignados.', href: '/configuracion/cargos', icono: Briefcase, color: 'indigo', modulo: 'configuracion' },
  { titulo: 'Entidades y bancos', desc: 'EPS, ARL, pensiones, cesantías, cajas de compensación y bancos disponibles en la ficha del colaborador.', href: '/configuracion/entidades', icono: Landmark, color: 'sky', modulo: 'configuracion' },
  { titulo: 'Parámetros de nómina', desc: 'Salario mínimo (SMMLV) y auxilio de transporte vigentes.', href: '/configuracion/parametros-nomina', icono: Coins, color: 'emerald', modulo: 'configuracion' },
  { titulo: 'Conceptos de nómina', desc: 'Devengados y deducciones propios, marcados como constitutivos o no de salario.', href: '/configuracion/conceptos-nomina', icono: Coins, color: 'emerald', modulo: 'configuracion' },
  { titulo: 'Usuarios', desc: 'Crea usuarios, asígnales rol y sedes, y controla su estado.', href: '/configuracion/usuarios', icono: Users, color: 'sky', modulo: 'usuarios' },
  { titulo: 'Roles y permisos', desc: 'Define qué puede ver y hacer cada rol en cada módulo.', href: '/configuracion/roles', icono: ShieldCheck, color: 'violet', modulo: 'usuarios' },
  { titulo: 'Tipos de documento', desc: 'Catálogo de documentos y cuáles son obligatorios por vínculo.', href: '/configuracion/tipos-documento', icono: FileStack, color: 'amber', modulo: 'configuracion' },
  { titulo: 'Reglas de alerta', desc: 'Días de anticipación de las alertas de vencimiento por tipo.', href: '/configuracion/alertas', icono: Bell, color: 'amber', modulo: 'configuracion' },
  { titulo: 'Notificaciones', desc: 'Elige qué eventos muestran un pop-up en pantalla (los demás siguen llegando a la campana y al correo).', href: '/configuracion/notificaciones', icono: BellRing, color: 'rose', modulo: 'configuracion' },
  { titulo: 'Módulos personalizados', desc: 'Crea pestañas y módulos a la medida con campos propios.', href: '/configuracion/modulos', icono: Layers, color: 'sky', modulo: 'configuracion' },
  { titulo: 'Plantillas de cuenta de cobro', desc: 'Diseña plantillas con logo y texto para las cuentas de cobro de los contratistas.', href: '/configuracion/plantillas-cuenta-cobro', icono: Receipt, color: 'teal', modulo: 'configuracion' },
]

export default async function ConfiguracionPage() {
  const usuario = await requerirPermiso('configuracion', 'VER').catch(() => requerirPermiso('usuarios', 'VER'))
  const visibles = SECCIONES.filter((s) => tienePermiso(usuario, s.modulo, 'VER'))

  return (
    <div className="max-w-7xl">
      <Encabezado titulo="Configuración" descripcion="Administra los parámetros y catálogos de la plataforma." />
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
        {visibles.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className={cn(
              'rounded-xl border bg-card p-3 text-left transition-all sm:p-3.5',
              'hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            )}
          >
            <Chip icono={s.icono} color={s.color} className="mb-2 rounded-[9px] sm:mb-2.5 sm:size-9" />
            <span className="block text-[12.5px] font-semibold leading-tight sm:text-[13px]">{s.titulo}</span>
            <span className="mt-0.5 hidden text-[11px] leading-snug text-muted-foreground sm:block">{s.desc}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
