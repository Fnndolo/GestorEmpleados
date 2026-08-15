import { requerirPermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { PlantillasCliente } from './plantillas-cliente'

export const metadata = { title: 'Plantillas de cuenta de cobro · Configuración' }

export default async function PlantillasCuentaCobroPage() {
  await requerirPermiso('configuracion', 'VER')
  const plantillas = await prisma.plantillaCuentaCobro.findMany({ orderBy: { creadoEn: 'desc' } })

  return (
    <div className="max-w-6xl">
      <Encabezado
        titulo="Plantillas de cuenta de cobro"
        descripcion="Crea distintas plantillas (días laborados, bonos, servicios…) con logo y texto. Usa variables como {{contratista}}, {{valor}}, {{periodo}}, {{concepto}}."
      />
      <PlantillasCliente
        plantillas={plantillas.map((p) => ({
          id: p.id, nombre: p.nombre, encabezado: p.encabezado, cuerpo: p.cuerpo, pieLegal: p.pieLegal,
          esDefecto: p.esDefecto, tieneLogo: Boolean(p.logoPath),
        }))}
      />
    </div>
  )
}
