import Link from 'next/link'
import { requerirPermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { Layers, ChevronRight } from 'lucide-react'
import { Constructor } from './constructor'

export const metadata = { title: 'Módulos personalizados · Configuración' }

export default async function ModulosPage() {
  await requerirPermiso('configuracion', 'EDITAR')
  const modulos = await prisma.moduloPersonalizado.findMany({
    include: { _count: { select: { campos: true, registros: true } } },
    orderBy: { creadoEn: 'desc' },
  })

  return (
    <div className="max-w-6xl">
      <Encabezado
        titulo="Módulos personalizados"
        descripcion="Crea pestañas y módulos a la medida con campos propios, sin necesidad de programar."
        acciones={<Constructor />}
      />
      {modulos.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
          <Layers className="size-8" /><p>Aún no has creado módulos personalizados.</p>
        </CardContent></Card>
      ) : (
        <Card><CardContent className="p-0 divide-y">
          {modulos.map((m) => (
            <Link key={m.id} href={`/modulos/${m.slug}`} className="flex items-center gap-3 p-3 hover:bg-accent/40">
              <Layers className="size-5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{m.nombre}</p>
                <p className="text-xs text-muted-foreground">{m._count.campos} campos · {m._count.registros} registros · {m.seccion}</p>
              </div>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          ))}
        </CardContent></Card>
      )}
    </div>
  )
}
