import { requerirPermiso } from '@/server/sesion'
import { Encabezado } from '@/components/shell/encabezado'
import { EnConstruccion } from '@/components/shell/en-construccion'

export const metadata = { title: 'Vencimientos · Smart Gadgets RH' }

export default async function Pagina() {
  await requerirPermiso('vencimientos', 'VER')
  return (
    <div className="mx-auto max-w-5xl">
      <Encabezado titulo="Vencimientos" descripcion="Tablero de vencimientos con semáforo y filtros por sede." />
      <EnConstruccion fase="Fase 3" />
    </div>
  )
}
