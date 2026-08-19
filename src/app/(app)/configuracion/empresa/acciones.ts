'use server'

import { revalidatePath } from 'next/cache'
import { dbAuditado, auditar } from '@/lib/auditoria'
import { prisma } from '@/lib/db'
import { accion } from '@/server/accion'
import { obtenerSesion, tienePermiso } from '@/server/sesion'
import { subirArchivo, eliminarArchivo } from '@/server/storage'
import { empresaSchema } from '@/lib/validaciones/catalogos'

/** 2 MB: es una imagen de fondo, no un escaneo; más pesa el PDF de cada contrato. */
const MAX_MEMBRETE_BYTES = 2 * 1024 * 1024
const TIPOS_MEMBRETE = ['image/png', 'image/jpeg', 'image/webp']

/**
 * Sube el papel membretado de los documentos legales.
 *
 * Recibe FormData (no un data URI): el archivo viaja como multipart, que es para
 * lo que está hecho, sin inflarse un 33 % ni pasar por la serialización de los
 * argumentos de la Server Action.
 *
 * Se espera una imagen tamaño carta SIN el pie de contacto impreso: ese lo
 * escribe la app con los datos de esta misma pantalla, para que cambiar el
 * correo o el NIT no obligue a rehacer la imagen.
 */
export async function subirMembrete(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const usuario = await obtenerSesion()
  if (!usuario) return { ok: false, error: 'No autorizado.' }
  if (!tienePermiso(usuario, 'configuracion', 'EDITAR')) {
    return { ok: false, error: 'No tienes permiso para cambiar el membrete.' }
  }

  const archivo = formData.get('archivo')
  if (!(archivo instanceof File)) return { ok: false, error: 'No llegó ninguna imagen.' }
  if (archivo.size === 0) return { ok: false, error: 'La imagen está vacía.' }
  if (archivo.size > MAX_MEMBRETE_BYTES) return { ok: false, error: 'La imagen supera los 2 MB.' }
  if (!TIPOS_MEMBRETE.includes(archivo.type)) {
    return { ok: false, error: 'Formato no admitido. Usa PNG, JPG o WEBP.' }
  }

  const actual = await prisma.configuracionEmpresa.findFirst()
  if (!actual) return { ok: false, error: 'Primero guarda los datos de la empresa.' }

  const contenido = Buffer.from(await archivo.arrayBuffer())
  const subido = await subirArchivo('empresa', archivo.name, contenido, archivo.type)

  // El anterior se borra: solo hay un membrete vigente y guardarlos todos llena
  // el almacenamiento de imágenes que nadie va a volver a usar.
  const anterior = actual.membreteFondoPath
  await dbAuditado.configuracionEmpresa.update({
    where: { id: actual.id },
    data: { membreteFondoPath: subido.storagePath },
  })
  if (anterior) await eliminarArchivo(anterior).catch(() => {})

  revalidatePath('/configuracion/empresa')
  return { ok: true }
}

/** Vuelve al membrete que trae la aplicación. */
export const quitarMembrete = accion(
  { modulo: 'configuracion', accion: 'EDITAR' },
  async () => {
    const actual = await prisma.configuracionEmpresa.findFirst()
    if (!actual?.membreteFondoPath) return { ok: true }
    await dbAuditado.configuracionEmpresa.update({
      where: { id: actual.id },
      data: { membreteFondoPath: null },
    })
    await eliminarArchivo(actual.membreteFondoPath).catch(() => {})
    revalidatePath('/configuracion/empresa')
    return { ok: true }
  },
)

const MAX_FIRMA_BYTES = 1 * 1024 * 1024
const TIPOS_FIRMA = ['image/png', 'image/webp']

/**
 * Carga la firma escaneada del representante legal.
 *
 * Es el activo más delicado de esta pantalla: con esa imagen se puede estampar
 * una firma en cualquier documento. Por eso:
 *  - exige permiso de EDICIÓN de configuración, no solo de lectura;
 *  - el archivo nunca se devuelve por una URL (no existe endpoint que lo sirva),
 *    solo se lee en el servidor al generar un PDF;
 *  - cada cambio queda en auditoría con quién lo hizo.
 *
 * Se pide PNG o WEBP porque necesitan fondo transparente: un JPG pintaría un
 * rectángulo blanco encima de la línea de firma.
 */
export async function subirFirmaRepLegal(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const usuario = await obtenerSesion()
  if (!usuario) return { ok: false, error: 'No autorizado.' }
  if (!tienePermiso(usuario, 'configuracion', 'EDITAR')) {
    return { ok: false, error: 'No tienes permiso para cambiar la firma de la empresa.' }
  }

  const archivo = formData.get('archivo')
  if (!(archivo instanceof File)) return { ok: false, error: 'No llegó ninguna imagen.' }
  if (archivo.size === 0) return { ok: false, error: 'La imagen está vacía.' }
  if (archivo.size > MAX_FIRMA_BYTES) return { ok: false, error: 'La imagen supera 1 MB.' }
  if (!TIPOS_FIRMA.includes(archivo.type)) {
    return { ok: false, error: 'Usa PNG o WEBP con fondo transparente.' }
  }

  const actual = await prisma.configuracionEmpresa.findFirst()
  if (!actual) return { ok: false, error: 'Primero guarda los datos de la empresa.' }

  const contenido = Buffer.from(await archivo.arrayBuffer())
  const subido = await subirArchivo('empresa/firma', archivo.name, contenido, archivo.type)

  const anterior = actual.firmaRepLegalPath
  await dbAuditado.configuracionEmpresa.update({
    where: { id: actual.id },
    data: { firmaRepLegalPath: subido.storagePath },
  })
  if (anterior) await eliminarArchivo(anterior).catch(() => {})

  await auditar('EDITAR', 'ConfiguracionEmpresa', {
    registroId: actual.id,
    descripcion: 'Se cargó una firma nueva del representante legal',
  })
  revalidatePath('/configuracion/empresa')
  return { ok: true }
}

export const quitarFirmaRepLegal = accion(
  { modulo: 'configuracion', accion: 'EDITAR' },
  async () => {
    const actual = await prisma.configuracionEmpresa.findFirst()
    if (!actual?.firmaRepLegalPath) return { ok: true }
    await dbAuditado.configuracionEmpresa.update({
      where: { id: actual.id },
      data: { firmaRepLegalPath: null },
    })
    await eliminarArchivo(actual.firmaRepLegalPath).catch(() => {})
    await auditar('ELIMINAR', 'ConfiguracionEmpresa', {
      registroId: actual.id,
      descripcion: 'Se eliminó la firma del representante legal',
    })
    revalidatePath('/configuracion/empresa')
    return { ok: true }
  },
)

export const guardarEmpresa = accion(
  { modulo: 'configuracion', accion: 'EDITAR', schema: empresaSchema },
  async (datos) => {
    const actual = await prisma.configuracionEmpresa.findFirst()
    if (!actual) {
      await dbAuditado.configuracionEmpresa.create({ data: datos })
    } else {
      await dbAuditado.configuracionEmpresa.update({ where: { id: actual.id }, data: datos })
    }
    revalidatePath('/configuracion/empresa')
    return { ok: true }
  },
)
