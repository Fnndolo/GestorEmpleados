'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { accion } from '@/server/accion'
import { prisma } from '@/lib/db'
import { dbAuditado, auditar } from '@/lib/auditoria'
import { eliminarDocumento } from '@/server/documentos'
import { generarCertificacion } from '@/server/certificaciones'

export const generarCertificacionRRHH = accion(
  {
    modulo: 'colaboradores',
    accion: 'EDITAR',
    schema: z.object({
      colaboradorId: z.uuid(),
      tipo: z.enum(['SIMPLE', 'CON_SALARIO', 'CON_FUNCIONES', 'ENTIDAD_FINANCIERA']),
      dirigidaA: z.string().max(200).optional(),
    }),
  },
  async (d, usuario) => {
    const r = await generarCertificacion({
      colaboradorId: d.colaboradorId,
      tipo: d.tipo,
      dirigidaA: d.dirigidaA || null,
      generadoPorId: usuario.id,
    })
    revalidatePath(`/colaboradores/${d.colaboradorId}`)
    return r
  },
)

/**
 * Anular una certificación emitida por error (datos equivocados, destinatario
 * que no era). El modelo no tiene estado "anulada", así que se borra el registro
 * y su PDF; el motivo queda en auditoría.
 */
export const anularCertificacion = accion(
  { modulo: 'colaboradores', accion: 'ELIMINAR', schema: z.object({ id: z.uuid(), motivo: z.string().trim().min(5, 'Explica por qué se anula.').max(300) }) },
  async (d) => {
    const cert = await prisma.certificacionLaboral.findUniqueOrThrow({ where: { id: d.id } })
    if (cert.documentoId) await eliminarDocumento(cert.documentoId).catch(() => {})
    await dbAuditado.certificacionLaboral.delete({ where: { id: cert.id } })
    await auditar('ELIMINAR', 'CertificacionLaboral', { registroId: cert.id, descripcion: `Anulada (${cert.tipo}${cert.dirigidaA ? `, dirigida a ${cert.dirigidaA}` : ''}): ${d.motivo}` })
    revalidatePath(`/colaboradores/${cert.colaboradorId}`)
    return { ok: true }
  },
)
