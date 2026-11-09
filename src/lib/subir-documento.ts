import { subirArchivoTemporal, tipoDeArchivo, TIPOS_EVIDENCIA } from '@/lib/archivos'

/**
 * Vercel no deja pasar por una función un cuerpo de más de 4,5 MB: lo corta
 * antes de llegar al código y devuelve un 413 que no es JSON. Por debajo de
 * este límite el archivo va en el formulario, como siempre.
 */
const LIMITE_FORMULARIO = 4 * 1024 * 1024

/**
 * Envía el formulario a /api/documentos/subir (o a `url`, que debe aceptar
 * `archivoRef` igual). Si el archivo pesa más de lo que
 * aguanta el servidor, el PDF (o comprimido) va antes directo al depósito
 * temporal y el formulario lleva solo su referencia (`archivoRef`). Devuelve
 * siempre una respuesta con `{ error }` en JSON cuando algo falla.
 */
export async function subirDocumentoForm(fd: FormData, url = '/api/documentos/subir'): Promise<Response> {
  const archivo = fd.get('archivo')
  if (archivo instanceof File && archivo.size > LIMITE_FORMULARIO) {
    const mb = (archivo.size / 1024 / 1024).toFixed(1).replace('.', ',')
    if (!(TIPOS_EVIDENCIA as readonly string[]).includes(tipoDeArchivo(archivo))) {
      return Response.json({ error: `El archivo pesa ${mb} MB. Súbelo en PDF o como una foto más liviana (máximo 4 MB).` }, { status: 413 })
    }
    try {
      const ref = await subirArchivoTemporal(archivo, 'evidencia')
      fd.delete('archivo')
      fd.set('archivoRef', ref)
      fd.set('archivoNombre', archivo.name)
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : 'No se pudo subir el archivo.' }, { status: 400 })
    }
  }
  return fetch(url, { method: 'POST', body: fd })
}
