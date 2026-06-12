import { requerirPermiso } from '@/server/sesion'
import { Encabezado } from '@/components/shell/encabezado'
import { EnConstruccion } from '@/components/shell/en-construccion'

export const metadata = { title: 'Autoservicio · Smart Gadgets RH' }

export default async function Pagina() {
  await requerirPermiso('autoservicio', 'VER')
  return (
    <div className="mx-auto max-w-5xl">
      <Encabezado titulo="Autoservicio" descripcion="Solicitudes y descargas del empleado con flujo de aprobación." />
      <EnConstruccion fase="Fase 5" />
    </div>
  )
}
