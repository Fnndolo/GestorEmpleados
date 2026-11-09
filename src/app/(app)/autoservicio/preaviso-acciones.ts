'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { accion, ErrorNegocio } from '@/server/accion'
import { obtenerPdfAdjunto, borrarPdfTemporal } from '@/server/archivos-temporales'
import { responderPreaviso } from '@/server/preavisos'

/** La persona sube el preaviso ya firmado o diligenciado. */
export const subirMiPreavisoFirmado = accion(
  { modulo: 'autoservicio', accion: 'CREAR', schema: z.object({ preavisoId: z.uuid(), pdfRef: z.string().min(16).max(2000) }) },
  async (d, usuario) => {
    if (!usuario.colaboradorId) throw new ErrorNegocio('Tu usuario no está vinculado a una ficha de colaborador.')
    const pdf = await obtenerPdfAdjunto({ pdfRef: d.pdfRef }, usuario.id, 'El PDF está vacío.')
    await responderPreaviso({ preavisoId: d.preavisoId, colaboradorId: usuario.colaboradorId, pdf, usuarioId: usuario.id })
    await borrarPdfTemporal(d.pdfRef, usuario.id)
    revalidatePath('/autoservicio/contratos')
    revalidatePath('/autoservicio')
    return { ok: true }
  },
)
