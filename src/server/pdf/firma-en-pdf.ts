import 'server-only'
import { PDFDocument } from 'pdf-lib'

/**
 * Firma sobre un PDF que NO generó la app.
 *
 * El motor normal de firma (`aplicarFirmaContratoOps`) no estampa nada: regenera
 * el documento entero desde la plantilla guardada en `contenidoPdf` e incrusta
 * las firmas al renderizar. Con un contrato subido no hay plantilla que
 * regenerar —el PDF *es* el documento—, así que la firma hay que dibujarla
 * encima del archivo original.
 *
 * Dónde va la firma se resuelve en dos pasos:
 *  1. Al subir el PDF se recorre su capa de texto buscando las etiquetas del
 *     bloque de firmas ("EL CONTRATISTA", "EL CONTRATANTE") y se propone una
 *     posición.
 *  2. Un humano la confirma o la corrige, y queda guardada en el contrato.
 * Así la detección automática ahorra trabajo pero nunca decide sola: un PDF sin
 * capa de texto (escaneado) simplemente no propone nada y se marca a mano.
 *
 * Coordenadas: pdfjs entrega el `transform` del texto en espacio de usuario PDF
 * —origen abajo-izquierda—, el mismo que usa pdf-lib para dibujar. No hay
 * conversión de por medio; verificado leyendo y reescribiendo el mismo punto.
 */

/** Posición de una firma dentro del PDF, en puntos y con la página en base 1. */
export type PosicionFirma = { pagina: number; x: number; y: number; ancho: number; alto: number }

/** Posiciones de ambas partes. `null` = no se pudo proponer, hay que marcarla a mano. */
export type PosicionesFirma = {
  contratista: PosicionFirma | null
  contratante: PosicionFirma | null
}

/** Tamaño por defecto del recuadro de firma, en puntos (≈5.3 × 1.6 cm). */
const ANCHO_FIRMA = 150
const ALTO_FIRMA = 45

/**
 * Una etiqueta del bloque de firmas es un fragmento CORTO: "EL CONTRATISTA" es
 * su propio renglón, mientras que en el cuerpo la palabra viene dentro de
 * párrafos largos. El umbral descarta el cuerpo sin necesidad de entender el
 * documento.
 */
const LARGO_MAX_ETIQUETA = 40

type ItemTexto = { texto: string; x: number; y: number; pagina: number }

/** Extrae el texto del PDF con la posición de cada fragmento. */
async function leerTextoConPosiciones(pdf: Buffer): Promise<ItemTexto[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(pdf),
    // En Node no hay worker ni fetch de recursos: se resuelve todo en proceso.
    useWorkerFetch: false,
    useSystemFonts: true,
  }).promise

  const items: ItemTexto[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const pagina = await doc.getPage(p)
    const contenido = await pagina.getTextContent()
    for (const item of contenido.items as { str?: string; transform?: number[] }[]) {
      const texto = (item.str ?? '').trim()
      if (!texto || !item.transform) continue
      const [, , , , x, y] = item.transform
      items.push({ texto, x, y, pagina: p })
    }
  }
  await doc.cleanup()
  return items
}

/**
 * Busca la etiqueta de una parte y propone el recuadro de firma JUSTO ENCIMA:
 * en un contrato el nombre va debajo de la línea de firma, así que la firma se
 * dibuja sobre la etiqueta, no sobre ella.
 *
 * Se toma la ÚLTIMA coincidencia del documento porque el bloque de firmas está
 * al final; las menciones del cuerpo quedan descartadas por el largo.
 */
function proponer(items: ItemTexto[], patron: RegExp): PosicionFirma | null {
  const candidatos = items.filter((i) => i.texto.length <= LARGO_MAX_ETIQUETA && patron.test(i.texto))
  const elegido = candidatos.at(-1)
  if (!elegido) return null
  return {
    pagina: elegido.pagina,
    x: elegido.x,
    // 10pt de aire sobre la etiqueta para no pisar el texto.
    y: elegido.y + 10,
    ancho: ANCHO_FIRMA,
    alto: ALTO_FIRMA,
  }
}

/**
 * Propone dónde va la firma de cada parte leyendo el PDF subido.
 * Devuelve `null` en la parte que no se pudo ubicar (PDF escaneado, etiquetas
 * distintas): el llamador debe pedir que se marque a mano.
 */
export async function ubicarFirmasEnPdf(pdf: Buffer): Promise<PosicionesFirma> {
  let items: ItemTexto[]
  try {
    items = await leerTextoConPosiciones(pdf)
  } catch {
    // Un PDF ilegible no debe tumbar la subida: se resuelve marcando a mano.
    return { contratista: null, contratante: null }
  }
  return {
    // \b evita que "CONTRATANTE" satisfaga la búsqueda de "CONTRATISTA".
    contratista: proponer(items, /\bCONTRATISTA\b/i),
    contratante: proponer(items, /\bCONTRATANTE\b/i),
  }
}

/** Cuántas páginas tiene el PDF: el selector manual necesita saberlo. */
export async function contarPaginas(pdf: Buffer): Promise<number> {
  const doc = await PDFDocument.load(pdf)
  return doc.getPageCount()
}

/**
 * Dibuja las firmas (PNG en data URI) sobre el PDF original y devuelve el nuevo
 * archivo. El original no se modifica: se carga, se copia y se guarda aparte,
 * de modo que siempre quede el documento tal como se subió.
 */
export async function estamparFirmasEnPdf(opts: {
  pdfOriginal: Buffer
  firmas: { posicion: PosicionFirma; imagenDataUri: string }[]
}): Promise<Buffer> {
  const doc = await PDFDocument.load(opts.pdfOriginal)

  for (const { posicion, imagenDataUri } of opts.firmas) {
    const base64 = imagenDataUri.split(',')[1] ?? ''
    if (!base64) continue
    const png = await doc.embedPng(Buffer.from(base64, 'base64'))

    // Una posición apuntando a una página inexistente dejaría la firma fuera del
    // documento sin que nadie lo note: se acota al rango real.
    const indice = Math.min(Math.max(posicion.pagina, 1), doc.getPageCount()) - 1
    const pagina = doc.getPage(indice)

    // La firma se escala para caber en el recuadro conservando su proporción,
    // así una firma ancha no queda aplastada.
    const escala = Math.min(posicion.ancho / png.width, posicion.alto / png.height)
    const ancho = png.width * escala
    const alto = png.height * escala

    pagina.drawImage(png, { x: posicion.x, y: posicion.y, width: ancho, height: alto })
  }

  return Buffer.from(await doc.save())
}
