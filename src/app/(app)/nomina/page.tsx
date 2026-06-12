import { requerirPermiso } from '@/server/sesion'
import { Encabezado } from '@/components/shell/encabezado'
import { EnConstruccion } from '@/components/shell/en-construccion'

export const metadata = { title: 'Nómina · Smart Gadgets RH' }

export default async function Pagina() {
  await requerirPermiso('nomina', 'VER')
  return (
    <div className="mx-auto max-w-5xl">
      <Encabezado titulo="Nómina" descripcion="Liquidación, conceptos, comisiones, desprendibles y PILA." />
      <EnConstruccion fase="Fase 6" />
    </div>
  )
}
