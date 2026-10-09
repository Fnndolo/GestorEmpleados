import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { unlink, rmdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { NextRequest } from 'next/server'

const sesion = vi.hoisted(() => ({ usuario: { id: 'prueba-upload', estado: 'ACTIVO', debeCambiarPassword: false } as Record<string, unknown> | null }))
vi.mock('@/server/sesion', () => ({ obtenerSesion: async () => sesion.usuario }))
vi.mock('@/server/accion', () => ({ ErrorNegocio: class ErrorNegocio extends Error {} }))

import { guardarParteTemporal, prepararSubidaLocal, leerPdfTemporal, prepararSubidaDirecta } from './archivos-temporales'
import { subirArchivoTemporal, PARTE_ARCHIVO_BYTES, MAX_PDF_BYTES } from '@/lib/archivos'
import { POST, PATCH } from '@/app/api/archivos/pdf/route'

const referencias: string[] = []
let usuario: string
beforeEach(() => {
  usuario = `prueba-upload-${randomUUID()}`
  sesion.usuario = { id: usuario, estado: 'ACTIVO', debeCambiarPassword: false }
  vi.stubEnv('STORAGE_DRIVER', 'local')
  vi.stubEnv('BETTER_AUTH_SECRET', 'secreto-solo-para-las-pruebas')
})
afterEach(async () => {
  for (const ref of referencias.splice(0)) {
    const { p } = JSON.parse(Buffer.from(ref.split('.')[0], 'base64url').toString())
    const ruta = join(process.cwd(), 'uploads', p)
    for (const sufijo of ['', '.part', '.lock']) await unlink(ruta + sufijo).catch(() => {})
    await rmdir(dirname(ruta)).catch(() => {})
  }
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function preparar(bytes: number) {
  const { ref } = await prepararSubidaLocal(usuario, bytes)
  referencias.push(ref)
  return ref
}

describe('depósito temporal por partes', () => {
  it('sube, recupera y abre el PDF de 38,1 MB conservando todos sus bytes', async () => {
    const doc = await PDFDocument.create()
    doc.addPage([612, 792]).drawText('OTROSI - Firma del trabajador')
    // Flujo PDF sin comprimir: tamaño grande sin usar documentos personales.
    doc.context.register(doc.context.stream(new Uint8Array(Math.ceil(38.1 * 1024 * 1024))))
    const contenido = await doc.save()
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      const req = new NextRequest(`http://localhost${url}`, { ...init, signal: init.signal ?? undefined })
      const res = await (init.method === 'PATCH' ? PATCH(req) : POST(req))
      if (init.method === 'POST' && res.ok) referencias.push((await res.clone().json()).ref)
      return res
    })
    const ref = await subirArchivoTemporal(new File([new Uint8Array(contenido)], 'otrosi.pdf', { type: 'application/pdf' }))
    const recibido = await leerPdfTemporal(ref, usuario)
    expect(recibido.equals(Buffer.from(contenido))).toBe(true)
    expect((await PDFDocument.load(recibido)).getPageCount()).toBe(1)
    const { estamparFirmasEnPdf } = await import('@/server/pdf/firma-en-pdf')
    const firmado = await estamparFirmasEnPdf({
      pdfOriginal: recibido,
      firmas: [{ posicion: { pagina: 1, x: 100, y: 100, ancho: 100, alto: 40 },
        imagenDataUri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' }],
    })
    expect((await PDFDocument.load(firmado)).getPageCount()).toBe(1)
  }, 20000)

  it('no expone un archivo parcial y no duplica una parte reenviada', async () => {
    const contenido = Buffer.from('%PDF-123456789')
    const ref = await preparar(contenido.length)
    expect(await guardarParteTemporal(ref, usuario, 0, contenido.subarray(0, 7))).toBe(7)
    await expect(leerPdfTemporal(ref, usuario)).rejects.toThrow('no está disponible')
    expect(await guardarParteTemporal(ref, usuario, 0, contenido.subarray(0, 7))).toBe(7)
    expect(await guardarParteTemporal(ref, usuario, 7, contenido.subarray(7))).toBe(contenido.length)
    // Una última respuesta perdida también se puede recuperar.
    expect(await guardarParteTemporal(ref, usuario, 7, contenido.subarray(7))).toBe(contenido.length)
    expect((await leerPdfTemporal(ref, usuario)).equals(contenido)).toBe(true)
  })

  it('rechaza referencias de otra persona, alteradas y caducadas', async () => {
    const ref = await preparar(10)
    await expect(guardarParteTemporal(ref, 'otro', 0, Buffer.from('%PDF-'))).rejects.toThrow('otra persona')
    await expect(guardarParteTemporal(ref + 'x', usuario, 0, Buffer.from('%PDF-'))).rejects.toThrow('no es válida')
    vi.spyOn(Date, 'now').mockReturnValueOnce(Date.now() + 5 * 60 * 60 * 1000)
    await expect(guardarParteTemporal(ref, usuario, 0, Buffer.from('%PDF-'))).rejects.toThrow('caducó')
    vi.restoreAllMocks()
  })

  it('rechaza tamaños falsos, partes fuera de orden, sobredimensionadas y contenido ajeno al PDF', async () => {
    await expect(prepararSubidaLocal(usuario, MAX_PDF_BYTES + 1)).rejects.toThrow('capacidad de registro')
    await expect(prepararSubidaDirecta(usuario, 1.5)).rejects.toThrow('tamaño')
    await expect(prepararSubidaDirecta(usuario, Infinity)).rejects.toThrow('tamaño')
    const ref = await preparar(PARTE_ARCHIVO_BYTES + 10)
    await expect(guardarParteTemporal(ref, usuario, 1, Buffer.from('parte'))).rejects.toThrow('Falta una parte')
    await expect(guardarParteTemporal(ref, usuario, 0, Buffer.alloc(PARTE_ARCHIVO_BYTES + 1))).rejects.toThrow('tamaño válido')
    await expect(guardarParteTemporal(ref, usuario, 0, Buffer.from('hola'))).rejects.toThrow('no es un PDF')
    await expect(guardarParteTemporal(ref, usuario, PARTE_ARCHIVO_BYTES + 9, Buffer.from('xx'))).rejects.toThrow('tamaño válido')
  })

  it('la ruta exige una cuenta activa y contraseña actualizada para iniciar y enviar partes', async () => {
    for (const cuenta of [null, { estado: 'INACTIVO' }, { estado: 'ACTIVO', debeCambiarPassword: true }]) {
      sesion.usuario = cuenta
      expect((await POST(new NextRequest('http://localhost/api/archivos/pdf', { method: 'POST' }))).status).toBe(401)
      expect((await PATCH(new NextRequest('http://localhost/api/archivos/pdf', { method: 'PATCH' }))).status).toBe(401)
    }
  })

  it('limita el cuerpo de cada petición aunque no anuncie Content-Length', async () => {
    const ref = await preparar(PARTE_ARCHIVO_BYTES + 10)
    const req = new NextRequest('http://localhost/api/archivos/pdf', {
      method: 'PATCH', headers: { 'X-Archivo-Ref': ref, 'X-Archivo-Offset': '0' }, body: new Uint8Array(PARTE_ARCHIVO_BYTES + 1),
    })
    expect((await PATCH(req)).status).toBe(413)
    await expect(leerPdfTemporal(ref, usuario)).rejects.toThrow('no está disponible')
  })
})
