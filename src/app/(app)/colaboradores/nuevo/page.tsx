import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { cargarCatalogos } from '@/server/consultas/catalogos'
import { Encabezado } from '@/components/shell/encabezado'
import { FormColaborador } from '../form-colaborador'

export const metadata = { title: 'Nuevo colaborador · Smart Gadgets RH' }

export default async function NuevoColaboradorPage() {
  const usuario = await requerirPermiso('colaboradores', 'CREAR')
  const catalogos = await cargarCatalogos()
  const puedeEditarSalud = tienePermiso(usuario, 'colaboradores_salud', 'CREAR') || tienePermiso(usuario, 'colaboradores_salud', 'EDITAR')

  return (
    <div className="mx-auto max-w-4xl">
      <Encabezado titulo="Nuevo colaborador" descripcion="Completa la ficha. Solo el documento, nombres, celular, sede, vínculo y fecha de ingreso son obligatorios." />
      <FormColaborador catalogos={catalogos} puedeEditarSalud={puedeEditarSalud} />
    </div>
  )
}
