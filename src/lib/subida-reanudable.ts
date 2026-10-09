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
        reject(new Error(status === 413
          ? 'El almacenamiento rechazó el tamaño del archivo. Revisa el límite de archivos del proyecto y del depósito de documentos.'
          : 'No se pudo completar la subida. Revisa la conexión e inténtalo de nuevo.'))
      },
    })
    subida.start()
  })
}
