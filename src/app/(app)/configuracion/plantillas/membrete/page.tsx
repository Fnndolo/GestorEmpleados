import { redirect } from 'next/navigation'

/** El papel membretado se edita en una ventana emergente de la lista de documentos. */
export default function MembretePage() {
  redirect('/configuracion/plantillas?abrir=membrete')
}
