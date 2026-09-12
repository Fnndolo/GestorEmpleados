import { redirect } from 'next/navigation'

/** La autorización de datos se edita en una ventana emergente de la lista de documentos. */
export default function AutorizacionDatosPage() {
  redirect('/configuracion/plantillas?abrir=autorizacion')
}
