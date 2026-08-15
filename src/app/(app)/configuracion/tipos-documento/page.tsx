import { requerirPermiso } from '@/server/sesion'
import { Encabezado } from '@/components/shell/encabezado'
import { EnConstruccion } from '@/components/shell/en-construccion'

export const metadata = { title: 'Tipos de documento · Configuración' }

export default async function TiposDocumentoPage() {
  await requerirPermiso('configuracion', 'VER')
  return (
    <div className="max-w-6xl">
      <Encabezado titulo="Tipos de documento" descripcion="Catálogo de documentos y obligatoriedad por tipo de vínculo." />
      <EnConstruccion fase="Fase 2" descripcion="El catálogo de tipos de documento y el semáforo documental se habilitan junto con el módulo de Colaboradores." />
    </div>
  )
}
