import Link from 'next/link'
import { requerirSesion, tienePermiso } from '@/server/sesion'
import { seccionesVisibles } from '@/lib/navegacion'
import { prisma } from '@/lib/db'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Encabezado } from '@/components/shell/encabezado'
import { Building2, Users, ShieldCheck, ArrowRight, Bell } from 'lucide-react'
import { hoyBogota, formatFechaCorta } from '@/lib/fechas'

export const metadata = { title: 'Inicio · Smart Gadgets RH' }

export default async function InicioPage() {
  const usuario = await requerirSesion()
  const secciones = seccionesVisibles(usuario)

  const verVencimientos = tienePermiso(usuario, 'vencimientos', 'VER')
  const hoy = hoyBogota()
  const en30 = new Date(hoy); en30.setUTCDate(en30.getUTCDate() + 30)

  const [sedes, usuarios, roles, vencimientos] = await Promise.all([
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

      {verVencimientos && vencimientos.length > 0 && (
        <Card className="mb-8">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2"><Bell className="size-4" /> Próximos vencimientos</CardTitle>
            <Link href="/vencimientos" className="text-xs text-primary hover:underline">Ver todos</Link>
          </CardHeader>
          <CardContent className="p-0 divide-y border-t">
            {vencimientos.map((v) => {
              const vencido = v.fechaVencimiento < hoy
              return (
                <div key={v.id} className="flex items-center gap-3 px-6 py-2.5">
                  <span className={`size-2 shrink-0 rounded-full ${vencido ? 'bg-destructive' : 'bg-amber-500'}`} />
                  <p className="flex-1 min-w-0 text-sm truncate">{v.titulo}</p>
                  <Badge variant={vencido ? 'destructive' : 'outline'} className="text-[10px]">{formatFechaCorta(v.fechaVencimiento)}</Badge>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

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
