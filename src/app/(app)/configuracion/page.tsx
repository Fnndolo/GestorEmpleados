import { redirect } from 'next/navigation'

/**
 * Ajustes abre por los datos de la empresa: es lo que encabeza todo lo que ella
 * firma, y el punto de partida natural de la configuración. El menú de
 * secciones vive en el layout, así que aquí ya no hace falta un índice de
 * tarjetas — sería un segundo menú diciendo lo mismo.
 */
export default function ConfiguracionPage() {
  redirect('/configuracion/empresa')
}
