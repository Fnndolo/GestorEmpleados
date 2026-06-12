import Link from 'next/link'
import { requerirPermiso } from '@/server/sesion'
import { tienePermiso } from '@/server/sesion'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { Building2, Users, ShieldCheck, MapPin, Bell, FileStack, ArrowRight } from 'lucide-react'

export const metadata = { title: 'Configuración · Smart Gadgets RH' }

const SECCIONES = [
  { titulo: 'Empresa', desc: 'Razón social, NIT, representante legal y parámetros generales.', href: '/configuracion/empresa', icono: Building2, modulo: 'configuracion' as const },
  { titulo: 'Sedes y ciudades', desc: 'Administra las sedes y ciudades donde opera la empresa.', href: '/configuracion/sedes', icono: MapPin, modulo: 'configuracion' as const },
  { titulo: 'Usuarios', desc: 'Crea usuarios, asígnales rol y sedes, y controla su estado.', href: '/configuracion/usuarios', icono: Users, modulo: 'usuarios' as const },
  { titulo: 'Roles y permisos', desc: 'Define qué puede ver y hacer cada rol en cada módulo.', href: '/configuracion/roles', icono: ShieldCheck, modulo: 'usuarios' as const },
  { titulo: 'Tipos de documento', desc: 'Catálogo de documentos y cuáles son obligatorios por vínculo.', href: '/configuracion/tipos-documento', icono: FileStack, modulo: 'configuracion' as const },
  { titulo: 'Reglas de alerta', desc: 'Días de anticipación de las alertas de vencimiento por tipo.', href: '/configuracion/alertas', icono: Bell, modulo: 'configuracion' as const },
]

export default async function ConfiguracionPage() {
  const usuario = await requerirPermiso('configuracion', 'VER').catch(() => requerirPermiso('usuarios', 'VER'))
  const visibles = SECCIONES.filter((s) => tienePermiso(usuario, s.modulo, 'VER'))

  return (
    <div className="mx-auto max-w-5xl">
      <Encabezado titulo="Configuración" descripcion="Administra los parámetros y catálogos de la plataforma." />
      <div className="grid gap-3 sm:grid-cols-2">
        {visibles.map((s) => {
          const Icono = s.icono
          return (
            <Link key={s.href} href={s.href} className="group">
              <Card className="h-full transition-colors hover:border-primary/40 hover:bg-accent/40">
                <CardContent className="flex items-start gap-3 py-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icono className="size-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{s.titulo}</p>
                    <p className="text-sm text-muted-foreground">{s.desc}</p>
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
