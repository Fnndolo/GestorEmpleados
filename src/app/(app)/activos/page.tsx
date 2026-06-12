import { requerirPermiso } from '@/server/sesion'
import { Encabezado } from '@/components/shell/encabezado'
import { EnConstruccion } from '@/components/shell/en-construccion'

export const metadata = { title: 'Activos y dotación · Smart Gadgets RH' }

export default async function Pagina() {
  await requerirPermiso('activos', 'VER')
  return (
    <div className="mx-auto max-w-5xl">
      <Encabezado titulo="Activos y dotación" descripcion="Inventario, actas de entrega/devolución y dotación legal." />
      <EnConstruccion fase="Fase 8" />
    </div>
  )
}
