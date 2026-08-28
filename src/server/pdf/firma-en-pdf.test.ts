import { describe, it, expect } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { ubicarFirmasEnPdf, estamparFirmasEnPdf, contarPaginas } from './firma-en-pdf'

/**
 * El riesgo de ubicar la firma automáticamente no es no encontrar la etiqueta:
 * es encontrar la equivocada. "CONTRATISTA" aparece decenas de veces en el
 * cuerpo del contrato y una sola en el bloque de firmas, así que las pruebas se
 * centran en que gane la del final y no una del articulado.
 */

/** PNG 1×1 transparente: sirve de firma de prueba sin depender de un archivo. */
const PNG_1X1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

/** Arma un contrato de dos páginas: articulado + bloque de firmas al final. */
async function contratoDePrueba(): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)

  const p1 = doc.addPage([612, 792])
  p1.drawText('CONTRATO DE PRESTACION DE SERVICIOS', { x: 120, y: 740, size: 13, font })
  // Cuerpo: menciona a las partes muchas veces, en renglones largos.
  let y = 700
  for (let i = 0; i < 12; i++) {
    p1.drawText(
      'EL CONTRATISTA se obliga frente a EL CONTRATANTE a ejecutar las actividades pactadas con plena autonomia.',
      { x: 60, y, size: 9, font },
    )
    y -= 16
  }

  const p2 = doc.addPage([612, 792])
  p2.drawText('En constancia se firma en Pasto a los 29 dias del mes de agosto de 2026.', { x: 60, y: 600, size: 10, font })
  // Bloque de firmas: etiquetas cortas, cada una en su renglon.
  p2.drawText('EL CONTRATANTE', { x: 70, y: 220, size: 10, font })
  p2.drawText('EL CONTRATISTA', { x: 350, y: 220, size: 10, font })
  p2.drawText('KUPOCELL S.A.S.', { x: 70, y: 205, size: 9, font })
  p2.drawText('ANDRES FELIPE LOPEZ CAICEDO', { x: 350, y: 205, size: 9, font })

  return Buffer.from(await doc.save())
}

describe('ubicarFirmasEnPdf', () => {
  it('ubica el bloque de firmas del final, no las menciones del articulado', async () => {
    const pos = await ubicarFirmasEnPdf(await contratoDePrueba())

    // Ambas partes se ubican en la última página, no en la primera.
    expect(pos.contratante?.pagina).toBe(2)
    expect(pos.contratista?.pagina).toBe(2)

    // Y en la columna que les corresponde, no cruzadas.
    expect(pos.contratante?.x).toBeCloseTo(70, 0)
    expect(pos.contratista?.x).toBeCloseTo(350, 0)
  })

  it('coloca la firma ENCIMA de la etiqueta, que es donde va la línea de firma', async () => {
    const pos = await ubicarFirmasEnPdf(await contratoDePrueba())
    // La etiqueta está en y=220; la firma debe quedar por encima.
    expect(pos.contratista!.y).toBeGreaterThan(220)
  })

  it('no confunde CONTRATANTE con CONTRATISTA', async () => {
    const pos = await ubicarFirmasEnPdf(await contratoDePrueba())
    expect(pos.contratista!.x).not.toBeCloseTo(pos.contratante!.x, 0)
  })

  it('devuelve null en un PDF sin capa de texto, en vez de reventar', async () => {
    // Un PDF con una página vacía es el equivalente a un escaneo: no hay texto.
    const doc = await PDFDocument.create()
    doc.addPage([612, 792])
    const pos = await ubicarFirmasEnPdf(Buffer.from(await doc.save()))
    expect(pos.contratista).toBeNull()
    expect(pos.contratante).toBeNull()
  })
})

describe('estamparFirmasEnPdf', () => {
  it('conserva las páginas del original y devuelve un PDF válido', async () => {
    const original = await contratoDePrueba()
    const firmado = await estamparFirmasEnPdf({
      pdfOriginal: original,
      firmas: [{ posicion: { pagina: 2, x: 350, y: 230, ancho: 150, alto: 45 }, imagenDataUri: PNG_1X1 }],
    })
    expect(await contarPaginas(firmado)).toBe(await contarPaginas(original))
    expect(firmado.subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('no altera el archivo original', async () => {
    const original = await contratoDePrueba()
    const copia = Buffer.from(original)
    await estamparFirmasEnPdf({
      pdfOriginal: original,
      firmas: [{ posicion: { pagina: 1, x: 100, y: 100, ancho: 150, alto: 45 }, imagenDataUri: PNG_1X1 }],
    })
    expect(original.equals(copia)).toBe(true)
  })

  it('acota una página fuera de rango en vez de perder la firma', async () => {
    const original = await contratoDePrueba()
    const firmado = await estamparFirmasEnPdf({
      pdfOriginal: original,
      // La página 99 no existe: debe caer en la última, no desaparecer.
      firmas: [{ posicion: { pagina: 99, x: 100, y: 100, ancho: 150, alto: 45 }, imagenDataUri: PNG_1X1 }],
    })
    expect(await contarPaginas(firmado)).toBe(2)
  })
})
