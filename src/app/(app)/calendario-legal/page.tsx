import { requerirPermiso } from '@/server/sesion'
import { Encabezado } from '@/components/shell/encabezado'
import { EnConstruccion } from '@/components/shell/en-construccion'

export const metadata = { title: 'Calendario de obligaciones legales · Smart Gadgets RH' }

export default async function Pagina() {
  await requerirPermiso('calendario_legal', 'VER')
  return (
    <div className="mx-auto max-w-5xl">
      <Encabezado titulo="Calendario de obligaciones legales" descripcion="Obligaciones societarias, tributarias, laborales y SIC con alertas." />
      <EnConstruccion fase="Fase 9" />
    </div>
  )
}
