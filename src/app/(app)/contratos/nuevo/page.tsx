import { requerirPermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { FormContrato } from '../form-contrato'

export const metadata = { title: 'Nuevo contrato · Smart Gadgets RH' }

export default async function NuevoContratoPage() {
  await requerirPermiso('contratos', 'CREAR')
  const [sedes, cargos] = await Promise.all([
    prisma.sede.findMany({ where: { activa: true }, include: { ciudad: true }, orderBy: { nombre: 'asc' } }),
    prisma.cargo.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }),
  ])
  return (
    <div className="mx-auto max-w-3xl">
      <Encabezado titulo="Nuevo contrato laboral" descripcion="Registra un contrato. Los de término fijo y el fin de periodo de prueba generan alertas de vencimiento." />
      <FormContrato catalogos={{
        sedes: sedes.map((s) => ({ id: s.id, nombre: s.nombre, ciudad: s.ciudad.nombre })),
        cargos: cargos.map((c) => ({ id: c.id, nombre: c.nombre })),
      }} />
    </div>
  )
}
