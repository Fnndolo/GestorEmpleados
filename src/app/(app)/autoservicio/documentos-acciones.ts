'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'
import { eliminarDocumento } from '@/server/documentos'
import { publicarVencimiento, cancelarVencimiento } from '@/server/vencimientos/servicio'
import { parseFechaISO, formatFechaISO } from '@/lib/fechas'
import type { UsuarioSesion } from '@/server/sesion'

/**
 * Un colaborador solo puede corregir o borrar los documentos que ÉL MISMO subió
 * a SU propia hoja de vida: nunca los que produce la empresa (contratos,
 * desprendibles, certificaciones, actas), aunque estén en su expediente.
 */
async function documentoPropio(id: string, usuario: UsuarioSesion) {
  const doc = await prisma.documento.findUnique({ where: { id } })
  if (!doc) throw new ErrorNegocio('El documento ya no existe.')
  const esSuyo =
    doc.entidadTipo === 'Colaborador' &&
    doc.entidadId === usuario.colaboradorId &&
    doc.subidoPorId === usuario.id
  if (!esSuyo) {
    throw new ErrorNegocio('Solo puedes corregir los documentos que tú mismo subiste. Para el resto, escribe a Talento Humano.')
  }
  return doc
}

const editarSchema = z.object({
  id: z.uuid(),
  nombre: z.string().trim().min(2, 'Escribe un nombre').max(200),
  descripcion: z.string().trim().max(500).optional().or(z.literal('')),
  tipoDocumentoId: z.uuid().optional().or(z.literal('')),
  fechaVencimiento: z.string().optional().or(z.literal('')),
})

/** Corrige los datos (nombre, tipo, descripción, vencimiento) de un documento propio. */
export const editarMiDocumento = accion(
  { modulo: 'autoservicio', accion: 'CREAR', schema: editarSchema },
  async (d, usuario) => {
    const doc = await documentoPropio(d.id, usuario)

    let nivelAcceso = doc.nivelAcceso
    if (d.tipoDocumentoId) {
      const td = await prisma.tipoDocumento.findUnique({ where: { id: d.tipoDocumentoId } })
      if (!td) throw new ErrorNegocio('El tipo de documento no existe.')
      if (td.requiereVencimiento && !d.fechaVencimiento) {
        throw new ErrorNegocio(`${td.nombre} requiere la fecha de vencimiento.`)
      }
      nivelAcceso = td.nivelAcceso
    }

    const fechaVencimiento = parseFechaISO(d.fechaVencimiento || null)
    const actualizado = await dbAuditado.documento.update({
      where: { id: doc.id },
      data: {
        nombre: d.nombre,
        descripcion: d.descripcion || null,
        tipoDocumentoId: d.tipoDocumentoId || null,
        fechaVencimiento,
        nivelAcceso,
      },
    })

    // La alerta de vencimiento se rehace: si se quitó la fecha se cancela, y si
    // cambió se vuelve a publicar con el dato nuevo.
    await cancelarVencimiento('Documento', doc.id, 'DOCUMENTO')
    if (actualizado.fechaVencimiento) {
      const tipoNombre = actualizado.tipoDocumentoId
        ? (await prisma.tipoDocumento.findUnique({ where: { id: actualizado.tipoDocumentoId } }))?.nombre
        : null
      const colab = await prisma.colaborador.findUnique({ where: { id: actualizado.entidadId } })
      await publicarVencimiento({
        origen: 'DOCUMENTO',
        entidadTipo: 'Documento',
        entidadId: actualizado.id,
        titulo: `${tipoNombre ?? actualizado.nombre}${colab ? ` — ${colab.nombres} ${colab.apellidos}` : ''}`,
        detalle: actualizado.descripcion,
        fechaVencimientoISO: formatFechaISO(actualizado.fechaVencimiento),
        sedeId: actualizado.sedeId,
      })
    }

    revalidatePath('/autoservicio/documentos')
    revalidatePath(`/colaboradores/${actualizado.entidadId}`)
  },
)

/** Borra un documento propio (p. ej. se subió el archivo equivocado). */
export const borrarMiDocumento = accion(
  { modulo: 'autoservicio', accion: 'CREAR', schema: z.object({ id: z.uuid() }) },
  async (d, usuario) => {
    const doc = await documentoPropio(d.id, usuario)
    await eliminarDocumento(doc.id)
    revalidatePath('/autoservicio/documentos')
    revalidatePath(`/colaboradores/${doc.entidadId}`)
  },
)
