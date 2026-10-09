import { Upload, DetailedError } from 'tus-js-client'
import type { SubidaReanudable } from './archivos'

/** El token permite únicamente subir a la ruta temporal que firmó el servidor. */
export function subirReanudable(
  archivo: File,
  mimeType: string,
  plan: SubidaReanudable,
  progreso?: (porcentaje: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const subida = new Upload(archivo, {
      endpoint: plan.endpoint,
      headers: { 'x-signature': plan.token },
      metadata: { bucketName: plan.bucket, objectName: plan.objectName, contentType: mimeType, cacheControl: '3600' },
      chunkSize: 6 * 1024 * 1024,
      retryDelays: [0, 1000, 3000, 5000],
      uploadDataDuringCreation: true,
      // La referencia es nueva en cada elección: no reutilizar rutas de otra
      // sesión ni guardar el permiso firmado en localStorage.
      storeFingerprintForResuming: false,
      onProgress: (bytes, total) => progreso?.(Math.round(bytes / total * 100)),
      onSuccess: () => resolve(),
      onError: (error) => {
        const status = error instanceof DetailedError ? error.originalResponse?.getStatus() : undefined
        // Lo que respondió el almacenamiento, para que el aviso diga la causa real.
        let detalle = ''
        try {
          const cuerpo = error instanceof DetailedError ? error.originalResponse?.getBody() ?? '' : ''
          const json = cuerpo.trim().startsWith('{') ? JSON.parse(cuerpo) as { message?: string } : null
          detalle = (json?.message ?? cuerpo).trim().slice(0, 160)
        } catch { /* sin cuerpo legible */ }
        const e = new Error(status === 413
          ? 'El almacenamiento rechazó el tamaño del archivo. Revisa el límite de archivos del proyecto y del depósito de documentos.'
          : `No se pudo completar la subida${status ? ` (${status}${detalle ? `: ${detalle}` : ''})` : ''}. Revisa la conexión e inténtalo de nuevo.`) as Error & { status?: number }
        e.status = status
        reject(e)
      },
    })
    subida.start()
  })
}
