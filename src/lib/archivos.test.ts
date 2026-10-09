import { afterEach, describe, expect, it, vi } from 'vitest'
import { PARTE_ARCHIVO_BYTES, subirArchivoTemporal } from './archivos'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('subirArchivoTemporal', () => {
  it('envía un archivo de 38,1 MB en partes de hasta 3 MB y muestra el avance', async () => {
    const archivo = new File([new Uint8Array(Math.ceil(38.1 * 1024 * 1024))], 'otrosi.pdf', { type: 'application/pdf' })
    let recibidos = 0
    const partes: number[] = []
    const mock = vi.fn(async (_url: unknown, init: RequestInit) => {
      if (init.method === 'POST') return Response.json({ modo: 'partes', ref: 'referencia-firmada' })
      const body = init.body as Blob
      expect((init.headers as Record<string, string>)['X-Archivo-Ref']).toBe('referencia-firmada')
      expect(Number((init.headers as Record<string, string>)['X-Archivo-Offset'])).toBe(recibidos)
      partes.push(body.size)
      recibidos += body.size
      return Response.json({ bytes: recibidos })
    })
    vi.stubGlobal('fetch', mock)
    const progreso = vi.fn()
    expect(await subirArchivoTemporal(archivo, 'firma', progreso)).toBe('referencia-firmada')
    expect(recibidos).toBe(archivo.size)
    expect(Math.max(...partes)).toBe(PARTE_ARCHIVO_BYTES)
    expect(partes.length).toBe(13)
    expect(progreso).toHaveBeenLastCalledWith(100)
  })

  it('reintenta una parte si se pierde la respuesta', async () => {
    vi.useFakeTimers()
    const mock = vi.fn()
      .mockResolvedValueOnce(Response.json({ modo: 'partes', ref: 'ref' }))
      .mockRejectedValueOnce(new Error('Red interrumpida'))
      .mockResolvedValueOnce(Response.json({ bytes: 5 }))
    vi.stubGlobal('fetch', mock)
    const pendiente = subirArchivoTemporal(new File(['%PDF-'], 'a.pdf', { type: 'application/pdf' }))
    await vi.runAllTimersAsync()
    expect(await pendiente).toBe('ref')
    expect(mock).toHaveBeenCalledTimes(3)
    expect(mock.mock.calls[1][1].body).toBe(mock.mock.calls[2][1].body)
  })

  it('no reintenta un rechazo por permisos ni usa multipart como respaldo', async () => {
    const mock = vi.fn()
      .mockResolvedValueOnce(Response.json({ modo: 'partes', ref: 'ref' }))
      .mockResolvedValueOnce(Response.json({ error: 'No autorizado' }, { status: 401 }))
    vi.stubGlobal('fetch', mock)
    await expect(subirArchivoTemporal(new File(['%PDF-'], 'a.pdf', { type: 'application/pdf' }))).rejects.toThrow('No autorizado')
    expect(mock).toHaveBeenCalledTimes(2)
  })

  it('rechaza archivos vacíos o tipos incompatibles antes de preparar la subida', async () => {
    const mock = vi.fn()
    vi.stubGlobal('fetch', mock)
    await expect(subirArchivoTemporal(new File([], 'a.pdf'))).rejects.toThrow('vacío')
    await expect(subirArchivoTemporal(new File(['archivo'], 'a.zip'))).rejects.toThrow('debe ser un PDF')
    expect(mock).not.toHaveBeenCalled()
  })
})
