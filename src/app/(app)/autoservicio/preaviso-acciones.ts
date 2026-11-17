'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { accion, ErrorNegocio } from '@/server/accion'
import { obtenerPdfAdjunto, borrarPdfTemporal } from '@/server/archivos-temporales'
import { responderPreaviso, preavisoPorFirmar, firmarPreavisoEnApp } from '@/server/preavisos'
import { generarYEnviarCodigoFirma, verificarCodigoFirma } from '@/server/firma/codigo-firma'

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

/** Código al correo para firmar en la app un documento del contrato. */
export const solicitarCodigoFirmaPreaviso = accion(
  { modulo: 'autoservicio', accion: 'CREAR', schema: z.object({ preavisoId: z.uuid() }) },
  async (d, usuario) => {
    await preavisoPorFirmar(d.preavisoId, usuario.colaboradorId)
    return generarYEnviarCodigoFirma({ proposito: 'FIRMA_CONTRATO_OPS', referenciaId: d.preavisoId, userId: usuario.id, email: usuario.email })
  },
)

/** Firmar en la app un documento del contrato (firma dibujada + código). */
export const firmarMiPreaviso = accion(
  {
    modulo: 'autoservicio',
    accion: 'CREAR',
    schema: z.object({
      preavisoId: z.uuid(),
      firmaDataUri: z.string().min(1).startsWith('data:image/', 'Firma inválida'),
      codigo: z.string().regex(/^\d{6}$/, 'El código debe tener 6 dígitos.'),
    }),
  },
  async (d, usuario) => {
    await preavisoPorFirmar(d.preavisoId, usuario.colaboradorId)
    await verificarCodigoFirma({ proposito: 'FIRMA_CONTRATO_OPS', referenciaId: d.preavisoId, userId: usuario.id, codigo: d.codigo })
    const r = await firmarPreavisoEnApp({ preavisoId: d.preavisoId, firmaDataUri: d.firmaDataUri, usuarioId: usuario.id, metodoAuth: 'CODIGO_EMAIL' })
    revalidatePath('/autoservicio/contratos')
    revalidatePath('/autoservicio')
    return r
  },
)
