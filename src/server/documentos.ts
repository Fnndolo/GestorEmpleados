import 'server-only'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { subirArchivo, eliminarArchivo } from '@/server/storage'
import type { UsuarioSesion } from '@/server/sesion'
import { tienePermiso } from '@/server/sesion'
import { parseFechaISO, formatFechaISO } from '@/lib/fechas'
import { publicarVencimiento, cancelarVencimiento } from '@/server/vencimientos/servicio'

const NIVEL_PERMISO: Record<string, { modulo: string }> = {
  SST_MEDICO: { modulo: 'colaboradores_salud' },
  RRHH: { modulo: 'colaboradores' },
  JURIDICA: { modulo: 'juridica' },
  ADMIN: { modulo: 'configuracion' },
}

/** ¿El usuario puede ver un documento con cierto nivel de acceso? */
export function puedeVerNivel(usuario: UsuarioSesion, nivel: string): boolean {
  if (nivel === 'GENERAL') return true
  const regla = NIVEL_PERMISO[nivel]
  if (!regla) return true
  return tienePermiso(usuario, regla.modulo as Parameters<typeof tienePermiso>[1], 'VER')
}

type DatosSubida = {
  entidadTipo: string
  entidadId: string
  tipoDocumentoId?: string | null
  nombre: string
  descripcion?: string | null
  fechaVencimiento?: string | null
  sedeId?: string | null
}

export async function guardarDocumento(
  usuario: UsuarioSesion,
  datos: DatosSubida,
  archivo: { nombre: string; mimeType: string; contenido: Buffer },
) {
  // Nivel de acceso heredado del tipo de documento (si hay)
  let nivelAcceso: 'GENERAL' | 'RRHH' | 'SST_MEDICO' | 'JURIDICA' | 'ADMIN' = 'GENERAL'
  if (datos.tipoDocumentoId) {
    const td = await prisma.tipoDocumento.findUnique({ where: { id: datos.tipoDocumentoId } })
    if (td) nivelAcceso = td.nivelAcceso
  }

  const prefijo = `${datos.entidadTipo.toLowerCase()}/${datos.entidadId}`
  const subido = await subirArchivo(prefijo, archivo.nombre, archivo.contenido, archivo.mimeType)

  const doc = await dbAuditado.documento.create({
    data: {
      entidadTipo: datos.entidadTipo,
      entidadId: datos.entidadId,
      tipoDocumentoId: datos.tipoDocumentoId || null,
      nombre: datos.nombre,
      descripcion: datos.descripcion || null,
      bucket: subido.bucket,
      storagePath: subido.storagePath,
      mimeType: subido.mimeType,
      tamanoBytes: subido.tamanoBytes,
      fechaVencimiento: parseFechaISO(datos.fechaVencimiento),
      nivelAcceso,
      sedeId: datos.sedeId || null,
      subidoPorId: usuario.id,
    },
  })

  // Si el documento tiene fecha de vencimiento, publica un Vencimiento (alertas)
  if (doc.fechaVencimiento) {
    const tipoNombre = doc.tipoDocumentoId
      ? (await prisma.tipoDocumento.findUnique({ where: { id: doc.tipoDocumentoId } }))?.nombre
      : null
    await publicarVencimiento({
      origen: 'DOCUMENTO',
      entidadTipo: 'Documento',
      entidadId: doc.id,
      titulo: `${tipoNombre ?? doc.nombre}`,
      detalle: doc.descripcion,
      fechaVencimientoISO: formatFechaISO(doc.fechaVencimiento),
      sedeId: doc.sedeId,
    })
  }

  return doc
}

export async function eliminarDocumento(id: string) {
  const doc = await prisma.documento.findUnique({ where: { id } })
  if (!doc) return
  await cancelarVencimiento('Documento', doc.id, 'DOCUMENTO')
  await eliminarArchivo(doc.storagePath)
  await dbAuditado.documento.delete({ where: { id } })
}
