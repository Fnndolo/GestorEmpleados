import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requerirPermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { eventosDelMes } from '@/server/consultas/eventos-colaborador'
import { CalendarioMes } from '@/components/calendario/calendario-mes'
import { hoyBogota } from '@/lib/fechas'

export const metadata = { title: 'Calendario del colaborador · Smart Gadgets RH' }

export default async function CalendarioColaboradorPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ mes?: string }>
}) {
  const { id } = await params
  const { mes: mesParam } = await searchParams
  await requerirPermiso('colaboradores', 'VER')

  const colab = await prisma.colaborador.findUnique({ where: { id }, select: { nombres: true, apellidos: true } })
  if (!colab) notFound()

  const hoy = hoyBogota()
  let anio = hoy.getUTCFullYear()
  let mes = hoy.getUTCMonth() + 1
  if (mesParam && /^\d{4}-\d{2}$/.test(mesParam)) {
    anio = Number(mesParam.slice(0, 4))
    mes = Number(mesParam.slice(5, 7))
  }

  const eventos = await eventosDelMes(id, anio, mes)

  return (
    <div className="mx-auto max-w-2xl">
      <Encabezado
        titulo={`Calendario · ${colab.nombres} ${colab.apellidos}`}
        descripcion="Días con vacaciones, permisos, licencias, día de la familia, compensatorios, incapacidades y suspensiones."
        acciones={
          <Button variant="outline" size="sm" asChild>
            <Link href={`/colaboradores/${id}`}><ArrowLeft className="size-4" /> Volver a la ficha</Link>
          </Button>
        }
      />
      <CalendarioMes anio={anio} mes={mes} eventos={eventos} baseHref={`/colaboradores/${id}/calendario`} />
    </div>
  )
}
