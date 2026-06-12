import { requerirPermiso } from '@/server/sesion'
import { Encabezado } from '@/components/shell/encabezado'
import { EnConstruccion } from '@/components/shell/en-construccion'

export const metadata = { title: 'Novedades · Smart Gadgets RH' }

export default async function Pagina() {
  await requerirPermiso('novedades', 'VER')
  return (
    <div className="mx-auto max-w-5xl">
      <Encabezado titulo="Novedades" descripcion="Incapacidades, licencias, permisos, vacaciones y bonificaciones." />
      <EnConstruccion fase="Fase 5" />
    </div>
  )
}
