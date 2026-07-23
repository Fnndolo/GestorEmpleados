import { requerirPermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { valorParametroVigente } from '@/server/nomina/parametros'
import { FormContrato } from '../form-contrato'

export const metadata = { title: 'Nuevo contrato · Smart Gadgets RH' }

export default async function NuevoContratoPage() {
  await requerirPermiso('contratos', 'CREAR')
  const [sedes, cargos, smmlv, auxTransporte, plantillas, empresa] = await Promise.all([
    prisma.sede.findMany({ where: { activa: true }, include: { ciudad: true }, orderBy: { nombre: 'asc' } }),
    prisma.cargo.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }),
    valorParametroVigente('SMMLV'),
    valorParametroVigente('AUX_TRANSPORTE'),
    // Plantillas laborales activas (una por tipo de contrato) para la vista previa en vivo.
    prisma.plantillaContrato.findMany({
      where: { activa: true, tipo: { not: 'OPS' } },
      include: { clausulas: { orderBy: { orden: 'asc' } } },
    }),
    prisma.configuracionEmpresa.findFirst(),
  ])
  return (
    <div className="mx-auto max-w-[1400px]">
      <Encabezado titulo="Nuevo contrato laboral" descripcion="Registra un contrato; si el tipo tiene plantilla, el documento se genera al crear (vista previa a la derecha)." />
      <FormContrato
        catalogos={{
          sedes: sedes.map((s) => ({ id: s.id, nombre: s.nombre, ciudad: s.ciudad.nombre })),
          cargos: cargos.map((c) => ({ id: c.id, nombre: c.nombre, funciones: (c.funcionesContrato as { grupo: string; items: string[] }[] | null) ?? null })),
          smmlv, auxTransporte,
        }}
        plantillas={plantillas.map((p) => ({
          tipo: p.tipo,
          titulo: p.titulo,
          intro: p.intro,
          cierre: p.cierre,
          clausulas: p.clausulas.map((cl) => ({ titulo: cl.titulo, cuerpo: cl.cuerpo, esFunciones: cl.esFunciones, orden: cl.orden })),
        }))}
        empresa={{
          razonSocial: empresa?.razonSocial ?? '',
          marca: empresa?.nombreComercial ?? null,
          nit: empresa?.nit ?? null,
          representanteLegal: empresa?.representanteLegal ?? null,
          representanteLegalCc: empresa?.representanteLegalCc ?? null,
          direccion: empresa?.direccion ?? null,
        }}
      />
    </div>
  )
}
