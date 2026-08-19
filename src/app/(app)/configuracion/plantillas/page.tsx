import { redirect } from 'next/navigation'

/**
 * La sección abre por el papel membretado: es el fondo de todo lo demás, así que
 * es el punto de partida natural. Las pestañas llevan al resto.
 */
export default function PlantillasPage() {
  redirect('/configuracion/plantillas/membrete')
}
