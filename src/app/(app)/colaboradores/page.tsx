import { requerirPermiso } from '@/server/sesion'
import { Encabezado } from '@/components/shell/encabezado'
import { EnConstruccion } from '@/components/shell/en-construccion'

export const metadata = { title: 'Colaboradores · Smart Gadgets RH' }

export default async function Pagina() {
  await requerirPermiso('colaboradores', 'VER')
  return (
    <div className="mx-auto max-w-5xl">
      <Encabezado titulo="Colaboradores" descripcion="Ficha completa del personal: datos, salud, documentos y organigrama." />
      <EnConstruccion fase="Fase 2" />
    </div>
  )
}
