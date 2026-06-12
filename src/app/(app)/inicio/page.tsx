import Link from 'next/link'
import { requerirSesion } from '@/server/sesion'
import { seccionesVisibles } from '@/lib/navegacion'
import { prisma } from '@/lib/db'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Encabezado } from '@/components/shell/encabezado'
import { Building2, Users, ShieldCheck, ArrowRight } from 'lucide-react'

export const metadata = { title: 'Inicio · Smart Gadgets RH' }

export default async function InicioPage() {
  const usuario = await requerirSesion()
  const secciones = seccionesVisibles(usuario)

  const [sedes, usuarios, roles] = await Promise.all([
    prisma.sede.count({ where: { activa: true } }),
    prisma.user.count({ where: { estado: 'ACTIVO' } }),
    prisma.rol.count(),
  ])

  const hora = new Date().toLocaleTimeString('es-CO', {
    timeZone: 'America/Bogota',
    hour: 'numeric',
  })
  const saludo = darSaludo()

  return (
    <div className="mx-auto max-w-6xl">
      <Encabezado
        titulo={`${saludo}, ${usuario.nombre.split(' ')[0]}`}
        descripcion={`Sesión activa como ${usuario.rolNombre}. Estos son tus accesos.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-8">
        <TarjetaDato icono={Users} etiqueta="Usuarios activos" valor={usuarios} />
        <TarjetaDato icono={Building2} etiqueta="Sedes" valor={sedes} />
        <TarjetaDato icono={ShieldCheck} etiqueta="Roles configurados" valor={roles} />
      </div>

      {secciones.map((seccion) => (
        <section key={seccion.titulo} className="mb-8">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
            {seccion.titulo}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {seccion.items.map((item) => {
              const Icono = item.icono
              return (
                <Link key={item.href} href={item.href} className="group">
                  <Card className="transition-colors hover:border-primary/40 hover:bg-accent/40">
                    <CardContent className="flex items-center gap-3 py-4">
                      <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icono className="size-5" />
                      </div>
                      <span className="flex-1 font-medium">{item.titulo}</span>
                      <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        </section>
      ))}

      <p className="text-xs text-muted-foreground">
        Hora local (Bogotá): {hora}
      </p>
    </div>
  )
}

function TarjetaDato({
  icono: Icono,
  etiqueta,
  valor,
}: {
  icono: typeof Users
  etiqueta: string
  valor: number
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{etiqueta}</CardTitle>
        <Icono className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold tabular-nums">{valor}</p>
      </CardContent>
    </Card>
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
