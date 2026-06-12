import { requerirPermiso } from '@/server/sesion'
import { Encabezado } from '@/components/shell/encabezado'
import { ImportadorCliente } from './importador-cliente'

export const metadata = { title: 'Importar colaboradores · Smart Gadgets RH' }

export default async function ImportarPage() {
  await requerirPermiso('colaboradores', 'CREAR')
  return (
    <div className="mx-auto max-w-4xl">
      <Encabezado
        titulo="Importar colaboradores"
        descripcion="Carga masiva desde una plantilla de Excel. Descarga la plantilla, complétala y súbela."
      />
      <ImportadorCliente />
    </div>
  )
}
