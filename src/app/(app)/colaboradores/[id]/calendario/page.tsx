import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requerirPermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { ArrowLeft } from 'lucide-react'
import { eventosDelAnio } from '@/server/consultas/eventos-colaborador'
import { CalendarioAnual } from '@/components/calendario/calendario-anual'
import { hoyBogota } from '@/lib/fechas'

export const metadata = { title: 'Calendario del colaborador · Smart Gadgets RH' }

export default async function CalendarioColaboradorPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ anio?: string }>
}) {
  const { id } = await params
  const { anio: anioParam } = await searchParams
  await requerirPermiso('colaboradores', 'VER')

  const colab = await prisma.colaborador.findUnique({ where: { id }, select: { nombres: true, apellidos: true } })
  if (!colab) notFound()

  const hoyD = hoyBogota()
  const hoy = { anio: hoyD.getUTCFullYear(), mes: hoyD.getUTCMonth() + 1, dia: hoyD.getUTCDate() }
  const anio = anioParam && /^\d{4}$/.test(anioParam) ? Number(anioParam) : hoy.anio

  const eventos = await eventosDelAnio(id, anio)

  return (
    <div className="max-w-7xl">
      {/* El regreso va arriba y el nombre debajo del título: en el celular el
          título largo más el párrafo explicativo ocupaban media pantalla. */}
      <Link href={`/colaboradores/${id}`} className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Volver a la ficha
      </Link>
      <Encabezado enLinea titulo="Calendario" descripcion={`${colab.nombres} ${colab.apellidos}`} />
      <CalendarioAnual anio={anio} eventos={eventos} hoy={hoy} baseHref={`/colaboradores/${id}/calendario`} />
    </div>
  )
}
