import { prisma } from '@/lib/db'
import { leerArchivo } from '@/server/storage'
import { MEMBRETE_FONDO } from './assets/membrete-fondo'

export type FondoMembrete = {
  /** Imagen de página completa, como data URI. */
  src: string
  /**
   * ¿Es un membrete subido por la empresa? De ser así la app escribe el pie de
   * contacto encima; el membrete que viene de fábrica ya lo trae impreso en la
   * imagen y escribirlo otra vez lo duplicaría.
   */
  propio: boolean
}

/** Extensión → tipo MIME, para armar el data URI del fondo subido. */
const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

/**
 * Papel membretado a usar en los documentos legales.
 *
 * Se resuelve en cada render en vez de recibirse por parámetro: así ninguna de
 * las pantallas que generan un PDF tiene que saber de esto, y cambiar el
 * membrete en Ajustes surte efecto de inmediato en todos los documentos.
 *
 * Si la imagen configurada no se puede leer (se borró del almacenamiento, por
 * ejemplo) se cae al membrete de fábrica: un contrato debe salir siempre, aunque
 * salga con el papel anterior.
 */
export async function fondoMembrete(): Promise<FondoMembrete> {
  const empresa = await prisma.configuracionEmpresa.findFirst({ select: { membreteFondoPath: true } })
  const ruta = empresa?.membreteFondoPath
  if (!ruta) return { src: MEMBRETE_FONDO, propio: false }

  try {
    const contenido = await leerArchivo(ruta)
    const ext = ruta.split('.').pop()?.toLowerCase() ?? 'png'
    const mime = MIME[ext] ?? 'image/png'
    return { src: `data:${mime};base64,${contenido.toString('base64')}`, propio: true }
  } catch (e) {
    console.error('No se pudo leer el membrete configurado; se usa el de fábrica:', e)
    return { src: MEMBRETE_FONDO, propio: false }
  }
}
