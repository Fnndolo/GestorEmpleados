import 'server-only'
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { ErrorNegocio } from '@/server/accion'
import { archivosAntiguos, eliminarArchivo, leerArchivo, subirArchivoEn, tamanoArchivo, urlSubidaFirmada } from '@/server/storage'
import { MAX_PDF_BYTES, mensajePdfPesado, mensajeTipoNoAdmitido, tiposDe, type ModoArchivo } from '@/lib/archivos'

/**
 * Depósito temporal de archivos (el PDF de un contrato, o el comprimido con
 * sus escaneos).
 *
 * Los contratos, otrosíes, acuerdos y documentos adjuntos se crean en una sola
 * Server Action (permiso, validación, registro, archivo, auditoría, aviso:
 * todo o nada). Como el cuerpo de una acción tiene tope de 4 MB, el archivo ya
 * no viaja dentro de ella en base64: el navegador lo sube antes —directo al
 * almacenamiento cuando se puede— y la acción recibe una REFERENCIA firmada
 * (`pdfRef`), lee el archivo, hace lo suyo y lo retira del depósito.
 *
 * La referencia lleva la ruta, el dueño, el tipo, el nombre original y una
 * caducidad, firmados con HMAC: nadie puede apuntar a otro archivo ni usar el
 * de otra persona, ni hacer pasar un ZIP por un PDF. No hace falta tabla en la
 * base. Lo que caduque sin usarse queda bajo `temporal/`; se puede barrer sin
 * riesgo (nada apunta ahí de forma permanente).
 */

const VIGENCIA_MS = 4 * 60 * 60 * 1000

/** Cómo empieza cada formato por dentro: así un ZIP no pasa por PDF ni al revés. */
const FIRMA_BINARIA: { tipo: string; inicio: Buffer }[] = [
  { tipo: 'application/pdf', inicio: Buffer.from('%PDF-', 'latin1') },
  { tipo: 'application/zip', inicio: Buffer.from([0x50, 0x4b, 0x03, 0x04]) },
  { tipo: 'application/zip', inicio: Buffer.from([0x50, 0x4b, 0x05, 0x06]) }, // zip vacío
  { tipo: 'application/vnd.rar', inicio: Buffer.from('Rar!', 'latin1') },
  { tipo: 'application/x-7z-compressed', inicio: Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]) },
]

/** Tipos que son el mismo formato con otro nombre. */
const CANONICO: Record<string, string> = {
  'application/x-zip-compressed': 'application/zip',
  'application/x-rar-compressed': 'application/vnd.rar',
}
const canonico = (tipo: string) => CANONICO[tipo] ?? tipo

const EXTENSION: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'application/vnd.rar': 'rar',
  'application/x-7z-compressed': '7z',
}

/** Todo lo del depósito vive aquí: una referencia que apunte fuera no vale. */
const RAIZ = 'temporal/'

/** Ruta del depósito para esa persona. Nadie más puede leerla (la referencia va firmada). */
const rutaTemporal = (usuarioId: string, mimeType: string) =>
  `${RAIZ}${usuarioId}/${randomUUID()}.${EXTENSION[canonico(mimeType)] ?? 'bin'}`

/** La extensión con que se archiva sale del TIPO, nunca del nombre que mandó el cliente. */
export const extensionDe = (mimeType: string) => EXTENSION[canonico(mimeType)] ?? 'bin'

/** El nombre original es informativo: se queda solo con el del archivo, sin rutas ni rarezas. */
const nombreLimpio = (nombre?: string) =>
  nombre
    ? nombre.split(/[\\/]/).pop()!.replace(/[^\w.\- áéíóúñÁÉÍÓÚÑ]/g, '').slice(0, 120) || undefined
    : undefined

/** El archivo pesa lo que debe y por dentro es lo que dice ser. */
function exigirArchivo(contenido: Buffer, mimeType: string) {
  if (contenido.byteLength === 0) throw new ErrorNegocio('El archivo está vacío.')
  if (contenido.byteLength > MAX_PDF_BYTES) throw new ErrorNegocio(mensajePdfPesado(contenido.byteLength))
  const esperado = canonico(mimeType)
  const coincide = FIRMA_BINARIA.some((f) => f.tipo === esperado && contenido.subarray(0, f.inicio.length).equals(f.inicio))
  if (!coincide) {
    throw new ErrorNegocio(
      esperado === 'application/pdf' ? 'El archivo no es un PDF.' : 'El archivo no es el comprimido que dice ser.',
    )
  }
}

function exigirTipoAdmitido(mimeType: string, modo: ModoArchivo) {
  if (!tiposDe(modo).includes(mimeType)) throw new ErrorNegocio(mensajeTipoNoAdmitido(modo))
}

/** Lo que lleva la referencia: ruta, dueño, tamaño, caducidad, tipo y nombre original. */
type Carga = { p: string; u: string; n: number; e: number; t?: string; f?: string }

export type ArchivoAdjunto = { contenido: Buffer; mimeType: string; nombre: string | null }

function secreto(): string {
  const s = process.env.BETTER_AUTH_SECRET
  if (!s) throw new Error('Falta BETTER_AUTH_SECRET para firmar las referencias de archivos.')
  return s
}

const firmar = (carga: string) => createHmac('sha256', secreto()).update(carga).digest('base64url')

/** Valida la firma y la caducidad; si se pasa `usuarioId`, también el dueño. */
function abrirRef(ref: string, usuarioId?: string): Carga {
  const [carga, firma] = ref.split('.')
  if (!carga || !firma) throw new ErrorNegocio('La referencia del archivo no es válida. Vuelve a adjuntarlo.')
  const esperada = Buffer.from(firmar(carga))
  const recibida = Buffer.from(firma)
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) {
    throw new ErrorNegocio('La referencia del archivo no es válida. Vuelve a adjuntarlo.')
  }
  const datos = JSON.parse(Buffer.from(carga, 'base64url').toString('utf8')) as Carga
  if (datos.e < Date.now()) throw new ErrorNegocio('El archivo adjunto caducó (pasaron más de 4 horas). Vuelve a adjuntarlo.')
  if (usuarioId && datos.u !== usuarioId) throw new ErrorNegocio('Ese archivo lo adjuntó otra persona. Vuelve a adjuntarlo.')
  // Cinturón y tirantes: aunque la firma es nuestra, la ruta solo puede ser del depósito.
  if (!datos.p.startsWith(RAIZ)) throw new ErrorNegocio('La referencia del archivo no es válida. Vuelve a adjuntarlo.')
  return datos
}

function refDe(storagePath: string, usuarioId: string, bytes: number, mimeType: string, nombre?: string): string {
  const carga = Buffer.from(
    JSON.stringify({
      p: storagePath, u: usuarioId, n: bytes, e: Date.now() + VIGENCIA_MS,
      t: canonico(mimeType), ...(nombreLimpio(nombre) ? { f: nombreLimpio(nombre) } : {}),
    } satisfies Carga),
  ).toString('base64url')
  return `${carga}.${firmar(carga)}`
}

/** Guarda el archivo en el depósito y devuelve la referencia firmada. */
export async function guardarArchivoTemporal(
  contenido: Buffer,
  usuarioId: string,
  opts: { mimeType: string; nombre?: string; modo?: ModoArchivo } = { mimeType: 'application/pdf' },
): Promise<{ ref: string; bytes: number }> {
  const mimeType = canonico(opts.mimeType)
  exigirTipoAdmitido(opts.mimeType, opts.modo ?? 'firma')
  exigirArchivo(contenido, mimeType)
  const storagePath = rutaTemporal(usuarioId, mimeType)
  await subirArchivoEn(storagePath, contenido, mimeType)
  return { ref: refDe(storagePath, usuarioId, contenido.byteLength, mimeType, opts.nombre), bytes: contenido.byteLength }
}

/** Atajo de siempre: un PDF. */
export function guardarPdfTemporal(pdf: Buffer, usuarioId: string): Promise<{ ref: string; bytes: number }> {
  return guardarArchivoTemporal(pdf, usuarioId, { mimeType: 'application/pdf', modo: 'firma' })
}

/**
 * Prepara una subida DIRECTA del navegador al almacenamiento: devuelve la URL
 * firmada a la que mandar el archivo y la referencia que después recibirá la
 * acción. Es lo que permite subir un escaneo grande en producción, donde el
 * servidor no admite cuerpos de más de ~4,5 MB.
 *
 * Devuelve null si el almacenamiento no puede firmar la subida (driver local
 * en desarrollo, o un fallo de Supabase): quien llama cae a la subida normal.
 * Aquí no se ve el archivo, así que su contenido se comprueba al leerlo.
 */
export async function prepararSubidaDirecta(
  usuarioId: string,
  bytes: number,
  opts: { mimeType?: string; nombre?: string; modo?: ModoArchivo } = {},
): Promise<{ url: string; ref: string } | null> {
  const mimeType = canonico(opts.mimeType ?? 'application/pdf')
  exigirTipoAdmitido(opts.mimeType ?? 'application/pdf', opts.modo ?? 'firma')
  if (bytes <= 0) throw new ErrorNegocio('El archivo está vacío.')
  if (bytes > MAX_PDF_BYTES) throw new ErrorNegocio(mensajePdfPesado(bytes))
  const storagePath = rutaTemporal(usuarioId, mimeType)
  const url = await urlSubidaFirmada(storagePath)
  if (!url) return null
  return { url, ref: refDe(storagePath, usuarioId, bytes, mimeType, opts.nombre) }
}

/** Lee el archivo de una referencia (solo su dueño), comprobando qué es. */
export async function leerArchivoTemporal(ref: string, usuarioId: string): Promise<ArchivoAdjunto> {
  const { p, t, f, n } = abrirRef(ref, usuarioId)
  const mimeType = canonico(t ?? 'application/pdf')

  // El tamaño ANTES de traerlo a memoria: lo que se subió directo no pasó por
  // el servidor, y bajar 50 MB para luego rechazarlos sería regalarle la
  // memoria del servidor a quien mienta en el tamaño que anunció.
  const tamano = await tamanoArchivo(p)
  if (tamano != null && (tamano > MAX_PDF_BYTES || (n && tamano > n))) {
    await eliminarArchivo(p).catch(() => {})
    throw new ErrorNegocio(mensajePdfPesado(tamano))
  }

  let contenido: Buffer
  try {
    contenido = await leerArchivo(p)
  } catch {
    throw new ErrorNegocio('El archivo adjunto ya no está disponible. Vuelve a adjuntarlo.')
  }
  // Y que sea lo que dice ser. Si no lo es, se retira del depósito: no va a
  // servir para nada y nadie más lo iba a borrar.
  try {
    exigirArchivo(contenido, mimeType)
  } catch (e) {
    await eliminarArchivo(p).catch(() => {})
    throw e
  }
  return { contenido, mimeType, nombre: f ?? null }
}

/** Lo mismo, cuando quien llama solo sabe trabajar con un PDF. */
export async function leerPdfTemporal(ref: string, usuarioId: string): Promise<Buffer> {
  const a = await leerArchivoTemporal(ref, usuarioId)
  if (a.mimeType !== 'application/pdf') throw new ErrorNegocio(mensajeTipoNoAdmitido('firma'))
  return a.contenido
}

/** Retira del depósito el archivo de una referencia. De mejor esfuerzo: nunca falla. */
export async function borrarPdfTemporal(ref: string | null | undefined, usuarioId?: string): Promise<void> {
  if (!ref) return
  try {
    const { p } = abrirRef(ref, usuarioId)
    await eliminarArchivo(p)
  } catch {
    /* ya no estaba o la referencia no vale: nada que retirar */
  }
}

/**
 * Barrido del depósito: lo que se subió y nunca se usó (se cerró el formulario,
 * falló el alta, se cambió de archivo) queda ahí sin que nadie lo reclame. Lo
 * llama el cron diario. Devuelve cuántos retiró.
 */
export async function limpiarDepositoTemporal(horas = 24): Promise<number> {
  const limite = new Date(Date.now() - horas * 60 * 60 * 1000)
  const viejos = await archivosAntiguos('temporal', limite)
  for (const ruta of viejos) await eliminarArchivo(ruta).catch(() => {})
  return viejos.length
}

type Adjunto = { pdfBase64?: string | null; pdfRef?: string | null }

/**
 * El archivo de una acción, venga como referencia al depósito (`pdfRef`, la
 * vía actual) o como data URI base64 (`pdfBase64`, la vía antigua, que siguen
 * usando las pruebas y los archivos pequeños). Devuelve también su tipo y su
 * nombre original, para archivarlo como lo que es.
 */
export async function obtenerArchivoAdjunto(
  d: Adjunto,
  usuarioId: string,
  vacio = 'El archivo adjunto está vacío.',
): Promise<ArchivoAdjunto> {
  if (d.pdfRef) return leerArchivoTemporal(d.pdfRef, usuarioId)
  const contenido = Buffer.from(d.pdfBase64?.split(',')[1] ?? '', 'base64')
  if (contenido.byteLength === 0) throw new ErrorNegocio(vacio)
  // La vía antigua también se comprueba: un data URI que diga ser PDF y no lo sea
  // no debe colarse solo por no haber pasado por el depósito.
  exigirArchivo(contenido, 'application/pdf')
  return { contenido, mimeType: 'application/pdf', nombre: null }
}

/** Lo mismo, para las acciones que necesitan abrir el PDF (firmarlo, leerlo). */
export async function obtenerPdfAdjunto(d: Adjunto, usuarioId: string, vacio = 'El PDF adjunto está vacío.'): Promise<Buffer> {
  const a = await obtenerArchivoAdjunto(d, usuarioId, vacio)
  if (a.mimeType !== 'application/pdf') throw new ErrorNegocio(mensajeTipoNoAdmitido('firma'))
  return a.contenido
}
