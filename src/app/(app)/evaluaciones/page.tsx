import { requerirPermiso } from '@/server/sesion'
import { Encabezado } from '@/components/shell/encabezado'
import { EnConstruccion } from '@/components/shell/en-construccion'

export const metadata = { title: 'Evaluación de desempeño · Smart Gadgets RH' }

export default async function Pagina() {
  await requerirPermiso('evaluaciones', 'VER')
  return (
    <div className="mx-auto max-w-5xl">
      <Encabezado titulo="Evaluación de desempeño" descripcion="Plantillas y resultados de evaluación." />
      <EnConstruccion fase="Fase 8" />
    </div>
  )
}
