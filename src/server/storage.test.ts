import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules() })

it('prepara TUS para una ruta concreta sin exponer la clave de servicio', async () => {
  vi.stubEnv('STORAGE_DRIVER', 'supabase')
  vi.stubEnv('SUPABASE_URL', 'https://prueba.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'clave-privada-de-prueba')
  vi.stubEnv('SUPABASE_BUCKET', 'documentos')
  vi.resetModules()
  const mock = vi.fn(async () => Response.json({ url: '/object/upload/sign/documentos/temporal/u/x.pdf?token=permiso-de-subida' }))
  vi.stubGlobal('fetch', mock)
  const { urlSubidaFirmada } = await import('./storage')
  expect(await urlSubidaFirmada('temporal/u/x.pdf')).toEqual({
    endpoint: 'https://prueba.storage.supabase.co/storage/v1/upload/resumable/sign',
    token: 'permiso-de-subida', bucket: 'documentos', objectName: 'temporal/u/x.pdf',
  })
  expect(mock).toHaveBeenCalledTimes(1)
})

it('no intenta almacenar en local si falla la autorización de Supabase', async () => {
  vi.stubEnv('STORAGE_DRIVER', 'supabase')
  vi.stubEnv('SUPABASE_URL', 'https://prueba.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'clave-privada-de-prueba')
  vi.resetModules()
  vi.stubGlobal('fetch', async () => Response.json({ message: 'Bucket not found' }, { status: 404 }))
  const { urlSubidaFirmada } = await import('./storage')
  await expect(urlSubidaFirmada('temporal/u/x.pdf')).rejects.toThrow('No se pudo autorizar')
})
