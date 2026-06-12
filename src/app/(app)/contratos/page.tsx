import { requerirPermiso } from '@/server/sesion'
import { Encabezado } from '@/components/shell/encabezado'
import { EnConstruccion } from '@/components/shell/en-construccion'

export const metadata = { title: 'Contratación y vinculación · Smart Gadgets RH' }

export default async function Pagina() {
  await requerirPermiso('contratos', 'VER')
  return (
    <div className="mx-auto max-w-5xl">
      <Encabezado titulo="Contratación y vinculación" descripcion="Contratos laborales y OPS, prórrogas, otrosí y cuentas de cobro." />
      <EnConstruccion fase="Fase 4" />
    </div>
  )
}
