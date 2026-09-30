import { redirect } from 'next/navigation'

/** La cuenta de cobro se edita como los demás textos, en la lista de documentos. */
export default function PlantillasCuentaCobroPage() {
  redirect('/configuracion/plantillas?abrir=CUENTA_COBRO')
}
