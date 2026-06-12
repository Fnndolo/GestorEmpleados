import { requerirPermiso } from '@/server/sesion'
import { Encabezado } from '@/components/shell/encabezado'
import { EnConstruccion } from '@/components/shell/en-construccion'

export const metadata = { title: 'Jurídica · Smart Gadgets RH' }

export default async function Pagina() {
  await requerirPermiso('juridica', 'VER')
  return (
    <div className="mx-auto max-w-5xl">
      <Encabezado titulo="Jurídica" descripcion="Plantillas, repositorio, disciplinarios, anti-acoso y habeas data." />
      <EnConstruccion fase="Fase 9" />
    </div>
  )
}
