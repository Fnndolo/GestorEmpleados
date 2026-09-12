import { redirect } from 'next/navigation'

/** Las plantillas de cuenta de cobro se editan en una ventana emergente de la lista de documentos. */
export default function PlantillasCuentaCobroPage() {
  redirect('/configuracion/plantillas?abrir=cuentas-cobro')
}
