import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requerirPermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Button } from '@/components/ui/button'
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
    <div className="mx-auto max-w-5xl">
      <Encabezado
        titulo={`Calendario · ${colab.nombres} ${colab.apellidos}`}
        descripcion="Vacaciones, permisos, licencias, día de la familia, compensatorios, incapacidades y suspensiones. Haz clic en un mes para verlo en detalle."
        acciones={
          <Button variant="outline" size="sm" asChild>
            <Link href={`/colaboradores/${id}`}><ArrowLeft className="size-4" /> Volver a la ficha</Link>
          </Button>
        }
      />
      <CalendarioAnual anio={anio} eventos={eventos} hoy={hoy} baseHref={`/colaboradores/${id}/calendario`} />
    </div>
  )
}
