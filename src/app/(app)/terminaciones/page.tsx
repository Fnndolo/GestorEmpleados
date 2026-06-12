import { requerirPermiso } from '@/server/sesion'
import { Encabezado } from '@/components/shell/encabezado'
import { EnConstruccion } from '@/components/shell/en-construccion'

export const metadata = { title: 'Terminaciones · Smart Gadgets RH' }

export default async function Pagina() {
  await requerirPermiso('terminaciones', 'VER')
  return (
    <div className="mx-auto max-w-5xl">
      <Encabezado titulo="Terminaciones" descripcion="Liquidación definitiva, paz y salvo y actas de retiro." />
      <EnConstruccion fase="Fase 7" />
    </div>
  )
}
