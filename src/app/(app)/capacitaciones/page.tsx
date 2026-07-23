import Link from 'next/link'
import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { GraduationCap, ChevronRight } from 'lucide-react'
import { Chip } from '@/components/ui-kit'
import { formatFechaCorta } from '@/lib/fechas'
import { CrearCapacitacion } from './crear-capacitacion'

export const metadata = { title: 'Capacitaciones · Smart Gadgets RH' }

const TIPO: Record<string, string> = { INDUCCION: 'Inducción', REINDUCCION: 'Reinducción', FORMACION: 'Formación', SST: 'SST' }

export default async function CapacitacionesPage() {
  const usuario = await requerirPermiso('capacitaciones', 'VER')
  const puedeCrear = tienePermiso(usuario, 'capacitaciones', 'CREAR')

  const capacitaciones = await prisma.capacitacion.findMany({
    include: { _count: { select: { asistencias: true } } },
    orderBy: { fecha: 'desc' },
    take: 100,
  })

  return (
    <div className="mx-auto max-w-4xl">
      <Encabezado titulo="Capacitaciones" descripcion="Registro de asistencia, inducción/reinducción y formación." acciones={puedeCrear && <CrearCapacitacion />} />
      {capacitaciones.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground"><GraduationCap className="size-8" /><p>Sin capacitaciones registradas.</p></CardContent></Card>
      ) : (
        <Card><CardContent className="p-0 divide-y">
          {capacitaciones.map((c) => (
            <Link key={c.id} href={`/capacitaciones/${c.id}`} className="flex items-center gap-3 p-3 transition-colors hover:bg-accent/40">
              <Chip icono={GraduationCap} color="violet" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{c.titulo}</p>
                <p className="text-xs text-muted-foreground">{formatFechaCorta(c.fecha)} · {c._count.asistencias} asistente(s)</p>
              </div>
              <Badge variant="outline">{TIPO[c.tipo]}</Badge>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          ))}
        </CardContent></Card>
      )}
    </div>
  )
}
