import 'server-only'
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { ErrorNegocio } from '@/server/accion'
import { eliminarArchivo, leerArchivo, subirArchivoEn, urlSubidaFirmada } from '@/server/storage'
import { MAX_PDF_BYTES, mensajePdfPesado } from '@/lib/archivos'

/**
 * Depósito temporal de PDF.
 *
 * Los contratos, otrosíes, acuerdos y documentos adjuntos se crean en una sola
 * Server Action (permiso, validación, registro, PDF, auditoría, aviso: todo o
 * nada). Como el cuerpo de una acción tiene tope de 4 MB, el PDF ya no viaja
 * dentro de ella en base64: el navegador lo sube antes a `/api/archivos/pdf`,
 * que lo deja aquí y devuelve una REFERENCIA firmada. La acción recibe la
 * referencia (`pdfRef`), lee el PDF, hace lo suyo y lo retira del depósito.
 *
 * La referencia lleva la ruta, el dueño y una caducidad, firmadas con HMAC:
 * nadie puede apuntar a otro archivo ni usar el de otra persona. No hace falta
 * tabla en la base. Lo que caduque sin usarse queda bajo `temporal/`; se puede
 * barrer sin riesgo (nada apunta ahí de forma permanente).
 */

const VIGENCIA_MS = 4 * 60 * 60 * 1000

/** Ruta del depósito para esa persona. Nadie más puede leerla (la referencia va firmada). */
const rutaTemporal = (usuarioId: string) => `temporal/${usuarioId}/${randomUUID()}.pdf`

/** Un PDF de verdad empieza por %PDF-; lo que no, se rechaza al leerlo. */
function exigirPdf(pdf: Buffer, bytesMax = MAX_PDF_BYTES) {
  if (pdf.byteLength === 0) throw new ErrorNegocio('El PDF está vacío.')
  if (pdf.byteLength > bytesMax) throw new ErrorNegocio(mensajePdfPesado(pdf.byteLength))
  if (pdf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new ErrorNegocio('El archivo no es un PDF.')
}

type Carga = { p: string; u: string; n: number; e: number }

function secreto(): string {
  const s = process.env.BETTER_AUTH_SECRET
  if (!s) throw new Error('Falta BETTER_AUTH_SECRET para firmar las referencias de archivos.')
  return s
}

const firmar = (carga: string) => createHmac('sha256', secreto()).update(carga).digest('base64url')

/** Valida la firma y la caducidad; si se pasa `usuarioId`, también el dueño. */
function abrirRef(ref: string, usuarioId?: string): Carga {
  const [carga, firma] = ref.split('.')
  if (!carga || !firma) throw new ErrorNegocio('La referencia del PDF no es válida. Vuelve a adjuntarlo.')
  const esperada = Buffer.from(firmar(carga))
  const recibida = Buffer.from(firma)
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) {
    throw new ErrorNegocio('La referencia del PDF no es válida. Vuelve a adjuntarlo.')
  }
  const datos = JSON.parse(Buffer.from(carga, 'base64url').toString('utf8')) as Carga
  if (datos.e < Date.now()) throw new ErrorNegocio('El PDF adjunto caducó (pasaron más de 4 horas). Vuelve a adjuntarlo.')
  if (usuarioId && datos.u !== usuarioId) throw new ErrorNegocio('Ese PDF lo adjuntó otra persona. Vuelve a adjuntarlo.')
  return datos
}

function refDe(storagePath: string, usuarioId: string, bytes: number): string {
  const carga = Buffer.from(JSON.stringify({ p: storagePath, u: usuarioId, n: bytes, e: Date.now() + VIGENCIA_MS } satisfies Carga)).toString('base64url')
  return `${carga}.${firmar(carga)}`
}

/** Guarda el PDF en el depósito y devuelve la referencia firmada. */
export async function guardarPdfTemporal(pdf: Buffer, usuarioId: string): Promise<{ ref: string; bytes: number }> {
  exigirPdf(pdf)
  const storagePath = rutaTemporal(usuarioId)
  await subirArchivoEn(storagePath, pdf, 'application/pdf')
  return { ref: refDe(storagePath, usuarioId, pdf.byteLength), bytes: pdf.byteLength }
}

/**
 * Prepara una subida DIRECTA del navegador al almacenamiento: devuelve la URL
 * firmada a la que mandar el archivo y la referencia que después recibirá la
 * acción. Es lo que permite subir un escaneo grande en producción, donde el
 * servidor no admite cuerpos de más de ~4,5 MB.
 *
 * Devuelve null si el almacenamiento no puede firmar la subida (driver local
 * en desarrollo, o un fallo de Supabase): quien llama cae a la subida normal.
 * Aquí no se ve el archivo, así que el PDF se valida al leerlo.
 */
export async function prepararSubidaDirecta(usuarioId: string, bytes: number): Promise<{ url: string; ref: string } | null> {
  if (bytes <= 0) throw new ErrorNegocio('El PDF está vacío.')
  if (bytes > MAX_PDF_BYTES) throw new ErrorNegocio(mensajePdfPesado(bytes))
  const storagePath = rutaTemporal(usuarioId)
  const url = await urlSubidaFirmada(storagePath)
  if (!url) return null
  return { url, ref: refDe(storagePath, usuarioId, bytes) }
}

/** Lee el PDF de una referencia (solo su dueño). */
export async function leerPdfTemporal(ref: string, usuarioId: string): Promise<Buffer> {
  const { p } = abrirRef(ref, usuarioId)
  let pdf: Buffer
  try {
    pdf = await leerArchivo(p)
  } catch {
    throw new ErrorNegocio('El PDF adjunto ya no está disponible. Vuelve a adjuntarlo.')
  }
  // Subido directo al almacenamiento, el servidor no lo vio pasar: se
  // comprueba aquí que sea un PDF y que no se pase de tamaño.
  exigirPdf(pdf)
  return pdf
}

/** Retira del depósito el PDF de una referencia. De mejor esfuerzo: nunca falla. */
export async function borrarPdfTemporal(ref: string | null | undefined): Promise<void> {
  if (!ref) return
  try {
    const { p } = abrirRef(ref)
    await eliminarArchivo(p)
  } catch {
    /* ya no estaba o la referencia no vale: nada que retirar */
  }
}

/**
 * El PDF de una acción, venga como referencia al depósito (`pdfRef`, la vía
 * actual) o como data URI base64 (`pdfBase64`, la vía antigua, que siguen
 * usando pruebas y archivos pequeños).
 */
export async function obtenerPdfAdjunto(
  d: { pdfBase64?: string | null; pdfRef?: string | null },
  usuarioId: string,
  vacio = 'El PDF adjunto está vacío.',
): Promise<Buffer> {
  if (d.pdfRef) return leerPdfTemporal(d.pdfRef, usuarioId)
  const pdf = Buffer.from(d.pdfBase64?.split(',')[1] ?? '', 'base64')
  if (pdf.byteLength === 0) throw new ErrorNegocio(vacio)
  return pdf
}
