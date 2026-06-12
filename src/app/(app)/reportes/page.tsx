import { requerirPermiso } from '@/server/sesion'
import { Encabezado } from '@/components/shell/encabezado'
import { EnConstruccion } from '@/components/shell/en-construccion'

export const metadata = { title: 'Reportes y tableros · Smart Gadgets RH' }

export default async function Pagina() {
  await requerirPermiso('reportes', 'VER')
  return (
    <div className="mx-auto max-w-5xl">
      <Encabezado titulo="Reportes y tableros" descripcion="Indicadores por sede, ciudad, vínculo, semáforo documental y más." />
      <EnConstruccion fase="Fase 11" />
    </div>
  )
}
