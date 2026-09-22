import { describe, it, expect } from 'vitest'
import { instalarSesionFalsa } from './sesion-falsa'

instalarSesionFalsa()

const { guardarPdfTemporal, guardarArchivoTemporal, leerPdfTemporal, leerArchivoTemporal, borrarPdfTemporal, obtenerPdfAdjunto, prepararSubidaDirecta } = await import('@/server/archivos-temporales')
const { MAX_PDF_BYTES } = await import('@/lib/archivos')
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

  it('rechaza lo que no es PDF, lo vacío y lo que se pasa del tope', async () => {
    await expect(guardarPdfTemporal(Buffer.from('hola'), YO)).rejects.toThrow(/no es un PDF/)
    await expect(guardarPdfTemporal(Buffer.alloc(0), YO)).rejects.toThrow(/vacío/)
    const pesado = Buffer.concat([PDF, Buffer.alloc(MAX_PDF_BYTES)])
    await expect(guardarPdfTemporal(pesado, YO)).rejects.toThrow(/máximo son 25 MB/)
    // El mismo tope antes de firmar una subida directa, donde el archivo no se ve.
    await expect(prepararSubidaDirecta(YO, MAX_PDF_BYTES + 1)).rejects.toThrow(/máximo son 25 MB/)
    await expect(prepararSubidaDirecta(YO, 0)).rejects.toThrow(/vacío/)
  })

  it('sin almacenamiento que firme la subida (driver local) no hay subida directa: se cae al servidor', async () => {
    expect(await prepararSubidaDirecta(YO, 1024)).toBeNull()
  })

  it('lo que se sube directo se valida al leerlo: si no es un PDF, no pasa', async () => {
    // Se simula una subida directa: la referencia existe, pero en esa ruta se
    // dejó cualquier cosa (el servidor no la vio pasar).
    const { ref } = await guardarPdfTemporal(PDF, YO)
    const { p } = JSON.parse(Buffer.from(ref.split('.')[0], 'base64url').toString())
    const { subirArchivoEn } = await import('@/server/storage')
    await subirArchivoEn(p, Buffer.from('esto no es un pdf'), 'application/pdf')
    await expect(leerPdfTemporal(ref, YO)).rejects.toThrow(/no es un PDF/)
    await borrarPdfTemporal(ref)
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

/**
 * El contrato ya firmado en físico se sube como evidencia: ahí vale un ZIP con
 * los escaneos. El que se manda a firmar NO: la app tiene que abrirlo.
 */
describe('comprimidos: solo donde el archivo es evidencia', () => {
  const ZIP = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(40)])

  it('guarda un ZIP en modo evidencia y lo devuelve con su tipo y su nombre', async () => {
    const { ref } = await guardarArchivoTemporal(ZIP, YO, { mimeType: 'application/zip', nombre: 'contrato-escaneado.zip', modo: 'evidencia' })
    const a = await leerArchivoTemporal(ref, YO)
    expect(a.mimeType).toBe('application/zip')
    expect(a.nombre).toBe('contrato-escaneado.zip')
    expect(a.contenido.equals(ZIP)).toBe(true)
    // Quien necesita abrirlo (firmar, estampar) lo rechaza.
    await expect(leerPdfTemporal(ref, YO)).rejects.toThrow(/debe ser un PDF/)
    await borrarPdfTemporal(ref)
  })

  it('en modo firma no se admite un comprimido', async () => {
    await expect(guardarArchivoTemporal(ZIP, YO, { mimeType: 'application/zip', modo: 'firma' })).rejects.toThrow(/debe ser un PDF/)
    await expect(prepararSubidaDirecta(YO, 1024, { mimeType: 'application/zip', modo: 'firma' })).rejects.toThrow(/debe ser un PDF/)
  })

  it('no se puede hacer pasar un ZIP por PDF, ni al revés', async () => {
    await expect(guardarArchivoTemporal(ZIP, YO, { mimeType: 'application/pdf', modo: 'evidencia' })).rejects.toThrow(/no es un PDF/)
    await expect(guardarArchivoTemporal(PDF, YO, { mimeType: 'application/zip', modo: 'evidencia' })).rejects.toThrow(/no es el comprimido/)
  })

  it('el tipo va firmado en la referencia: cambiarlo la invalida', async () => {
    const { ref } = await guardarArchivoTemporal(ZIP, YO, { mimeType: 'application/zip', nombre: 'x.zip', modo: 'evidencia' })
    const [carga, firma] = ref.split('.')
    const falsa = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(carga, 'base64url').toString()), t: 'application/pdf' })).toString('base64url')
    await expect(leerArchivoTemporal(`${falsa}.${firma}`, YO)).rejects.toThrow(/no es válida/)
    await borrarPdfTemporal(ref)
  })
})

/** Lo que la revisión encontró: el tamaño real manda, la ruta no se puede torcer y lo inválido no se queda. */
describe('depósito: límites y limpieza', () => {
  it('rechaza por el tamaño REAL del archivo, no por el que se anunció, y lo retira', async () => {
    const { ref } = await guardarPdfTemporal(PDF, YO)
    const { p, n } = JSON.parse(Buffer.from(ref.split('.')[0], 'base64url').toString())
    expect(n).toBe(PDF.byteLength)
    // Alguien anuncia poco y sube mucho: se cambia el archivo por uno enorme.
    const { subirArchivoEn, leerArchivo } = await import('@/server/storage')
    await subirArchivoEn(p, Buffer.concat([PDF, Buffer.alloc(200)]), 'application/pdf')
    await expect(leerArchivoTemporal(ref, YO)).rejects.toThrow(/máximo|pesa/)
    // Y no se queda ocupando espacio.
    await expect(leerArchivo(p)).rejects.toThrow()
  })

  it('una referencia que apunta fuera del depósito no vale', async () => {
    const { ref } = await guardarPdfTemporal(PDF, YO)
    const [carga, firma] = ref.split('.')
    const datos = JSON.parse(Buffer.from(carga, 'base64url').toString())
    const fuera = Buffer.from(JSON.stringify({ ...datos, p: 'contratos/otro/importante.pdf' })).toString('base64url')
    // Cambiar la ruta rompe la firma…
    await expect(leerArchivoTemporal(`${fuera}.${firma}`, YO)).rejects.toThrow(/no es válida/)
    await borrarPdfTemporal(ref)
  })

  it('el contenido que no es lo que dice se retira del depósito', async () => {
    const { ref } = await guardarPdfTemporal(PDF, YO)
    const { p } = JSON.parse(Buffer.from(ref.split('.')[0], 'base64url').toString())
    const { subirArchivoEn, leerArchivo } = await import('@/server/storage')
    await subirArchivoEn(p, Buffer.from('ni pdf ni nada'), 'application/pdf')
    await expect(leerArchivoTemporal(ref, YO)).rejects.toThrow(/no es un PDF/)
    await expect(leerArchivo(p)).rejects.toThrow()
  })

  it('la vía antigua en base64 también comprueba el contenido', async () => {
    const falso = `data:application/pdf;base64,${Buffer.from('esto no es un pdf').toString('base64')}`
    await expect(obtenerPdfAdjunto({ pdfBase64: falso }, YO)).rejects.toThrow(/no es un PDF/)
    const bueno = `data:application/pdf;base64,${PDF.toString('base64')}`
    expect((await obtenerPdfAdjunto({ pdfBase64: bueno }, YO)).equals(PDF)).toBe(true)
  })

  it('el barrido se lleva lo viejo y deja lo recién subido', async () => {
    const { limpiarDepositoTemporal } = await import('@/server/archivos-temporales')
    const { ref } = await guardarPdfTemporal(PDF, YO)
    // Horas negativas ponen el corte en el futuro: todo lo del depósito cuenta
    // como viejo, sin depender de cuántos milisegundos pasaron.
    expect(await limpiarDepositoTemporal(-1)).toBeGreaterThan(0)
    await expect(leerArchivoTemporal(ref, YO)).rejects.toThrow(/ya no está disponible/)
    // Y con el plazo normal, lo nuevo se queda.
    const nuevo = await guardarPdfTemporal(PDF, YO)
    expect(await limpiarDepositoTemporal(24)).toBe(0)
    expect((await leerArchivoTemporal(nuevo.ref, YO)).contenido.equals(PDF)).toBe(true)
    await borrarPdfTemporal(nuevo.ref)
  })
})
