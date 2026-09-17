'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { accion, ErrorNegocio } from '@/server/accion'
import { firmarOrdenHorasExtra } from '@/server/pago-horas-extra'
import { generarYEnviarCodigoFirma, verificarCodigoFirma } from '@/server/firma/codigo-firma'

/**
 * Firmar MI orden de pago de horas extra (espejo de `contratos-acciones.ts`,
 * pero para la orden de horas extra que se paga aparte de la nómina): código
 * de 6 dígitos al correo como autorización previa (Ley 527), y solo mientras
 * la orden esté esperando mi firma.
 */

/** Confirma que la orden es mía y está esperando firma. Devuelve el colaboradorId ya validado. */
async function ordenPropiaOFalla(pagoId: string, colaboradorId: string | null): Promise<void> {
  if (!colaboradorId) throw new ErrorNegocio('Tu usuario no está vinculado a una ficha de colaborador.')
  const p = await prisma.pagoHorasExtra.findUnique({ where: { id: pagoId }, select: { colaboradorId: true, estado: true } })
  if (!p || p.colaboradorId !== colaboradorId) throw new ErrorNegocio('Esta orden de pago no está a tu nombre.')
  if (p.estado !== 'ENVIADA_A_FIRMA') throw new ErrorNegocio('Esta orden no está esperando tu firma.')
}

export const solicitarCodigoFirmaPagoHorasExtra = accion(
  { modulo: 'autoservicio', accion: 'CREAR', schema: z.object({ pagoId: z.uuid() }) },
  async (d, usuario) => {
    await ordenPropiaOFalla(d.pagoId, usuario.colaboradorId)
    const { email, vigenciaMin } = await generarYEnviarCodigoFirma({
      proposito: 'FIRMA_PAGO_HORAS_EXTRA',
      referenciaId: d.pagoId,
      userId: usuario.id,
      email: usuario.email,
    })
    return { email, vigenciaMin }
  },
)

export const firmarMiOrdenHorasExtra = accion(
  {
    modulo: 'autoservicio',
    accion: 'CREAR',
    schema: z.object({
      pagoId: z.uuid(),
      firmaDataUri: z.string().min(1).startsWith('data:image/', 'Firma inválida'),
      codigo: z.string().regex(/^\d{6}$/, 'El código debe tener 6 dígitos.'),
    }),
  },
  async (d, usuario) => {
    await ordenPropiaOFalla(d.pagoId, usuario.colaboradorId)

    await verificarCodigoFirma({
      proposito: 'FIRMA_PAGO_HORAS_EXTRA',
      referenciaId: d.pagoId,
      userId: usuario.id,
      codigo: d.codigo,
    })

    const r = await firmarOrdenHorasExtra({
      pagoId: d.pagoId,
      firmaDataUri: d.firmaDataUri,
      usuarioId: usuario.id,
      metodoAuth: 'CODIGO_EMAIL',
    })

    revalidatePath('/autoservicio/horas-extra')
    revalidatePath('/autoservicio')
    return r
  },
)
