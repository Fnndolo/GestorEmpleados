import { redirect } from 'next/navigation'

/**
 * El alta de un contrato OPS se llena ahora en una ventana emergente sobre la
 * lista de contratación (`contratos/nuevo-contrato.tsx`). La ruta se conserva
 * por los enlaces viejos: abre la lista en la pestaña OPS con la ventana ya
 * desplegada. Los formularios siguen viviendo en esta carpeta.
 */
export default function NuevoOpsPage() {
  redirect('/contratos?tab=OPS&nuevo=ops')
}
