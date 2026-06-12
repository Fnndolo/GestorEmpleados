import { requerirPermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { FormOps } from './form-ops'

export const metadata = { title: 'Nuevo contrato OPS · Smart Gadgets RH' }

export default async function NuevoOpsPage() {
  await requerirPermiso('contratos', 'CREAR')
  const sedes = await prisma.sede.findMany({ where: { activa: true }, include: { ciudad: true }, orderBy: { nombre: 'asc' } })
  return (
    <div className="mx-auto max-w-3xl">
      <Encabezado titulo="Nuevo contrato OPS" descripcion="Prestación de servicios. El pago de cada cuenta de cobro exige verificar la seguridad social del contratista." />
      <FormOps sedes={sedes.map((s) => ({ id: s.id, nombre: s.nombre, ciudad: s.ciudad.nombre }))} />
    </div>
  )
}
