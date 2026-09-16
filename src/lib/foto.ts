/**
 * URL de la foto de perfil de un colaborador.
 *
 * Lleva una versión sacada del nombre del archivo (cambia con cada foto nueva),
 * así el navegador puede guardarla un día entero sin riesgo de mostrar la vieja:
 * al cambiar la foto cambia la URL. `mini` pide la miniatura de 96 px, que es lo
 * que cabe en los círculos de las listas y pesa una fracción de la completa.
 */
export function urlFoto(colaboradorId: string, fotoPath: string | null | undefined, mini = false): string | null {
  if (!fotoPath) return null
  const archivo = fotoPath.split('/').pop() ?? ''
  const version = archivo.split('.')[0].slice(0, 8)
  return `/api/documentos/foto/${colaboradorId}?v=${version}${mini ? '&t=mini' : ''}`
}

/** Ruta en storage de la miniatura, derivada de la foto completa. */
export function rutaMiniatura(fotoPath: string): string {
  return fotoPath.replace(/\.[^./]+$/, '') + '.mini.jpg'
}
