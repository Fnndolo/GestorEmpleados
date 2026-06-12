import { requerirPermiso } from '@/server/sesion'
import { Encabezado } from '@/components/shell/encabezado'
import { EnConstruccion } from '@/components/shell/en-construccion'

export const metadata = { title: 'Capacitaciones · Smart Gadgets RH' }

export default async function Pagina() {
  await requerirPermiso('capacitaciones', 'VER')
  return (
    <div className="mx-auto max-w-5xl">
      <Encabezado titulo="Capacitaciones" descripcion="Registro de asistencia y plan de formación." />
      <EnConstruccion fase="Fase 8" />
    </div>
  )
}
