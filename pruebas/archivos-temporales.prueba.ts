import { describe, it, expect } from 'vitest'
import { instalarSesionFalsa } from './sesion-falsa'

instalarSesionFalsa()

const { guardarPdfTemporal, leerPdfTemporal, borrarPdfTemporal, obtenerPdfAdjunto } = await import('@/server/archivos-temporales')
const { subirAcuerdoFirmadoSchema } = await import('@/lib/validaciones/acuerdo-evaluacion')
const { otrosiSchema } = await import('@/lib/validaciones/contrato')

/**
 * Depósito temporal de PDF: el navegador sube el archivo por partes y la
 * Server Action recibe una referencia firmada. Se prueba que la referencia
 * solo le sirve a su dueño, que no se puede falsificar y que las acciones
 * siguen aceptando el base64 de siempre.
 */

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF')
const YO = '00000000-0000-4000-8000-000000000001'
const OTRO = '00000000-0000-4000-8000-000000000002'

describe('depósito temporal de PDF', () => {
  it('guarda, devuelve una referencia y solo el dueño la puede leer; al retirarla deja de servir', async () => {
    const { ref, bytes } = await guardarPdfTemporal(PDF, YO)
    expect(bytes).toBe(PDF.byteLength)
    expect(ref.split('.')).toHaveLength(2)

    expect((await leerPdfTemporal(ref, YO)).equals(PDF)).toBe(true)
    await expect(leerPdfTemporal(ref, OTRO)).rejects.toThrow(/otra persona/)

    await borrarPdfTemporal(ref)
    await expect(leerPdfTemporal(ref, YO)).rejects.toThrow(/ya no está disponible/)
  })

  it('una referencia manipulada o inventada se rechaza', async () => {
    const { ref } = await guardarPdfTemporal(PDF, YO)
    const [carga, firma] = ref.split('.')
    const cargaAjena = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(carga, 'base64url').toString()), u: OTRO })).toString('base64url')
    await expect(leerPdfTemporal(`${cargaAjena}.${firma}`, OTRO)).rejects.toThrow(/no es válida/)
    await expect(leerPdfTemporal('abc.def', YO)).rejects.toThrow(/no es válida/)
    await borrarPdfTemporal(ref)
  })

  it('rechaza lo que no es PDF y lo que pesa más de 10 MB', async () => {
    await expect(guardarPdfTemporal(Buffer.from('hola'), YO)).rejects.toThrow(/no es un PDF/)
    await expect(guardarPdfTemporal(Buffer.alloc(0), YO)).rejects.toThrow(/vacío/)
    const pesado = Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)])
    await expect(guardarPdfTemporal(pesado, YO)).rejects.toThrow(/máximo son 10 MB/)
  })

  it('obtenerPdfAdjunto acepta la referencia o el base64 de siempre, y exige alguno', async () => {
    const { ref } = await guardarPdfTemporal(PDF, YO)
    expect((await obtenerPdfAdjunto({ pdfRef: ref }, YO)).equals(PDF)).toBe(true)
    expect((await obtenerPdfAdjunto({ pdfBase64: `data:application/pdf;base64,${PDF.toString('base64')}` }, YO)).equals(PDF)).toBe(true)
    await expect(obtenerPdfAdjunto({}, YO)).rejects.toThrow(/vacío/)
    await borrarPdfTemporal(ref)
  })

  it('los esquemas aceptan cualquiera de las dos vías y siguen exigiendo el PDF', () => {
    expect(subirAcuerdoFirmadoSchema.safeParse({ id: YO, pdfRef: 'x'.repeat(40) }).success).toBe(true)
    expect(subirAcuerdoFirmadoSchema.safeParse({ id: YO, pdfBase64: 'data:application/pdf;base64,JVBERi0=' }).success).toBe(true)
    const sin = subirAcuerdoFirmadoSchema.safeParse({ id: YO })
    expect(sin.success).toBe(false)
    if (!sin.success) expect(sin.error.issues[0].message).toBe('Adjunta el PDF firmado')

    const otrosi = { contratoId: YO, tiposCambio: ['OTRO'], posicionFirma: { pagina: 1, x: 1, y: 1, ancho: 150, alto: 45 } }
    expect(otrosiSchema.safeParse({ ...otrosi, pdfRef: 'x'.repeat(40) }).success).toBe(true)
    expect(otrosiSchema.safeParse(otrosi).success).toBe(false)
  })
})
