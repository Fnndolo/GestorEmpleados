import { redirect } from 'next/navigation'

/**
 * El alta de un contrato laboral se llena ahora en una ventana emergente sobre
 * la lista de contratación (`contratos/nuevo-contrato.tsx`). La ruta se
 * conserva por los enlaces viejos: abre la lista con la ventana ya desplegada.
 */
export default function NuevoContratoPage() {
  redirect('/contratos?nuevo=laboral')
}
