import { describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { subirReanudable } from './subida-reanudable'

describe('subida TUS con permiso firmado', () => {
  it('envía partes de 6 MB y continúa tras perder una respuesta sin repetir los bytes', async () => {
    const contenido = Buffer.alloc(13 * 1024 * 1024, 42)
    const partes: Buffer[] = []
    const metodos: string[] = []
    const firmas: (string | string[] | undefined)[] = []
    let offset = 0
    let cortar = true
    let metadata = ''
    const servidor = createServer(async (req, res) => {
      metodos.push(req.method!)
      firmas.push(req.headers['x-signature'])
      res.setHeader('Tus-Resumable', '1.0.0')
      if (req.method === 'HEAD') {
        res.setHeader('Upload-Offset', offset)
        res.setHeader('Upload-Length', contenido.length)
        res.end()
        return
      }
      const trozos: Buffer[] = []
      for await (const trozo of req) trozos.push(Buffer.from(trozo))
      const parte = Buffer.concat(trozos)
      if (req.method === 'POST') metadata = String(req.headers['upload-metadata'])
      if (req.method === 'PATCH' && Number(req.headers['upload-offset']) !== offset) {
        res.writeHead(409).end()
        return
      }
      partes.push(parte)
      offset += parte.length
      res.setHeader('Upload-Offset', offset)
      if (req.method === 'POST') {
        res.setHeader('Location', '/upload/archivo')
        res.writeHead(201).end()
      } else if (cortar) {
        cortar = false
        res.destroy() // Guardado correcto, respuesta perdida.
      } else res.writeHead(204).end()
    })
    await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', resolve))
    try {
      const progreso: number[] = []
      await subirReanudable(contenido as unknown as File, 'application/pdf', {
        endpoint: `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/upload`,
        token: 'permiso-solo-para-este-archivo', bucket: 'documentos', objectName: 'temporal/usuario/otrosi.pdf',
      }, (valor) => progreso.push(valor))
      expect(Buffer.concat(partes).equals(contenido)).toBe(true)
      expect(partes.map((p) => p.length)).toEqual([6 * 1024 * 1024, 6 * 1024 * 1024, 1024 * 1024])
      expect(metodos).toContain('HEAD')
      expect(firmas.every((f) => f === 'permiso-solo-para-este-archivo')).toBe(true)
      expect(metadata).toContain(`objectName ${Buffer.from('temporal/usuario/otrosi.pdf').toString('base64')}`)
      expect(progreso.at(-1)).toBe(100)
    } finally {
      await new Promise<void>((resolve, reject) => servidor.close((error) => error ? reject(error) : resolve()))
    }
  }, 10000)

  it('explica un rechazo del tamaño por el almacenamiento', async () => {
    const servidor = createServer((_req, res) => res.writeHead(413).end())
    await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', resolve))
    try {
      await expect(subirReanudable(Buffer.from('%PDF-') as unknown as File, 'application/pdf', {
        endpoint: `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/upload`,
        token: 'permiso', bucket: 'documentos', objectName: 'temporal/u/x.pdf',
      })).rejects.toThrow('El almacenamiento rechazó el tamaño')
    } finally {
      await new Promise<void>((resolve, reject) => servidor.close((error) => error ? reject(error) : resolve()))
    }
  })
})
