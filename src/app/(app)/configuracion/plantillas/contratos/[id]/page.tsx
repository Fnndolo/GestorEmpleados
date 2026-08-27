import { notFound } from 'next/navigation'
import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { EditorPlantilla } from './editor-plantilla'
import { TIPOS_PLANTILLA } from '@/lib/validaciones/plantilla-contrato'

export const metadata = { title: 'Editar plantilla · Configuración' }

/** `nueva` es la ruta de creación; cualquier otro valor es el id a editar. */
export default async function EditarPlantillaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const usuario = await requerirPermiso('configuracion', 'VER')
  const esNueva = id === 'nueva'
  const puedeGuardar = tienePermiso(usuario, 'configuracion', esNueva ? 'CREAR' : 'EDITAR')

  const plantilla = esNueva
    ? null
    : await prisma.plantillaContrato.findUnique({
        where: { id },
        include: { clausulas: { orderBy: { orden: 'asc' } } },
      })
  if (!esNueva && !plantilla) notFound()

  return (
    <div className="max-w-4xl">
      <Encabezado
        titulo={esNueva ? 'Nueva plantilla de contrato' : `Editar · ${plantilla!.nombre}`}
        descripcion="Escribe el texto legal y usa {{variables}} donde deban ir los datos de cada contrato. Guarda y revisa la muestra para ver cómo queda."
      />
      <EditorPlantilla
        puedeGuardar={puedeGuardar}
        valores={
          plantilla
            ? {
                id: plantilla.id,
                nombre: plantilla.nombre,
                tipo: plantilla.tipo as (typeof TIPOS_PLANTILLA)[number],
                titulo: plantilla.titulo,
                intro: plantilla.intro,
                cierre: plantilla.cierre,
                activa: plantilla.activa,
                clausulas: plantilla.clausulas.map((c) => ({ titulo: c.titulo, cuerpo: c.cuerpo, esFunciones: c.esFunciones })),
              }
            : null
        }
      />
    </div>
  )
}
