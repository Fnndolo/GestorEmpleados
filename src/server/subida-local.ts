import 'server-only'
import { mkdir, open, rename, stat, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { ErrorNegocio } from '@/server/accion'

const DIR_LOCAL = join(process.cwd(), 'uploads')

export class ErrorParteEnCurso extends ErrorNegocio {}

function destinoLocal(ruta: string) {
  if ((process.env.STORAGE_DRIVER ?? 'local') !== 'local') throw new ErrorNegocio('La subida debe ir directamente al almacenamiento.')
  return join(DIR_LOCAL, ruta)
}

/** El archivo final no se publica hasta que se han recibido todas las partes. */
export async function iniciarSubidaLocal(ruta: string): Promise<void> {
  const destino = destinoLocal(ruta)
  await mkdir(dirname(destino), { recursive: true })
  const archivo = await open(`${destino}.part`, 'wx')
  await archivo.close()
}

export async function escribirParteLocal(ruta: string, offset: number, parte: Buffer, total: number): Promise<number> {
  const destino = destinoLocal(ruta)
  // Bloqueo en disco: también protege si dos peticiones llegan a procesos
  // diferentes. Una respuesta perdida no debe duplicar los bytes.
  const bloqueo = await open(`${destino}.lock`, 'wx').catch((e: NodeJS.ErrnoException) => {
    if (e.code === 'EEXIST') throw new ErrorParteEnCurso('Hay una parte del archivo guardándose. Reintentando…')
    throw e
  })
  try {
    const final = await stat(destino).catch(() => null)
    if (final) {
      if (final.size !== total) throw new ErrorNegocio('El archivo recibido no coincide con el tamaño anunciado.')
      return total
    }
    const archivo = await open(`${destino}.part`, 'r+').catch(() => {
      throw new ErrorNegocio('La subida ya no está disponible. Vuelve a adjuntar el archivo.')
    })
    try {
      const { size } = await archivo.stat()
      if (offset < size) return size
      if (offset !== size) throw new ErrorNegocio('Falta una parte del archivo. Vuelve a adjuntarlo.')
      let escritos = 0
      while (escritos < parte.length) {
        const { bytesWritten } = await archivo.write(parte, escritos, parte.length - escritos, offset + escritos)
        if (!bytesWritten) throw new Error('No se pudo guardar la parte del archivo.')
        escritos += bytesWritten
      }
    } finally {
      await archivo.close()
    }
    const recibido = offset + parte.length
    if (recibido === total) await rename(`${destino}.part`, destino)
    return recibido
  } finally {
    await bloqueo.close()
    await unlink(`${destino}.lock`).catch(() => {})
  }
}
