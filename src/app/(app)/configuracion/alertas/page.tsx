import { requerirPermiso } from '@/server/sesion'
import { Encabezado } from '@/components/shell/encabezado'
import { EnConstruccion } from '@/components/shell/en-construccion'

export const metadata = { title: 'Reglas de alerta · Configuración' }

export default async function AlertasConfigPage() {
  await requerirPermiso('configuracion', 'VER')
  return (
    <div className="mx-auto max-w-4xl">
      <Encabezado titulo="Reglas de alerta" descripcion="Días de anticipación de las alertas de vencimiento por tipo." />
      <EnConstruccion fase="Fase 3" descripcion="El editor de reglas de alerta (10 días hábiles / 3 días, configurable por tipo) se habilita con el motor de vencimientos." />
    </div>
  )
}
