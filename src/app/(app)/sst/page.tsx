import { requerirPermiso } from '@/server/sesion'
import { Encabezado } from '@/components/shell/encabezado'
import { EnConstruccion } from '@/components/shell/en-construccion'

export const metadata = { title: 'Seguridad y Salud en el Trabajo · Smart Gadgets RH' }

export default async function Pagina() {
  await requerirPermiso('sst', 'VER')
  return (
    <div className="mx-auto max-w-5xl">
      <Encabezado titulo="Seguridad y Salud en el Trabajo" descripcion="SG-SST, comités, IPEVR, exámenes, accidentes y EPP." />
      <EnConstruccion fase="Fase 10" />
    </div>
  )
}
