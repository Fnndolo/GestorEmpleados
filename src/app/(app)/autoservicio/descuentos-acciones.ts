'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { accion } from '@/server/accion'
import { acuerdoPorFirmar, firmarAcuerdo } from '@/server/descuentos-acuerdo'
import { generarYEnviarCodigoFirma, verificarCodigoFirma } from '@/server/firma/codigo-firma'

/**
 * Firmar MI acuerdo de descuento (espejo de `horas-extra-acciones.ts`): código
 * de 6 dígitos al correo como autorización previa (Ley 527), y solo mientras el
 * acuerdo esté esperando mi firma.
 */
export const solicitarCodigoFirmaDescuento = accion(
  { modulo: 'autoservicio', accion: 'CREAR', schema: z.object({ prestamoId: z.uuid() }) },
  async (d, usuario) => {
    await acuerdoPorFirmar(d.prestamoId, usuario.colaboradorId)
    return generarYEnviarCodigoFirma({ proposito: 'FIRMA_ACUERDO_DESCUENTO', referenciaId: d.prestamoId, userId: usuario.id, email: usuario.email })
  },
)

export const firmarMiAcuerdoDescuento = accion(
  {
    modulo: 'autoservicio',
    accion: 'CREAR',
    schema: z.object({
      prestamoId: z.uuid(),
      firmaDataUri: z.string().min(1).startsWith('data:image/', 'Firma inválida'),
      codigo: z.string().regex(/^\d{6}$/, 'El código debe tener 6 dígitos.'),
    }),
  },
  async (d, usuario) => {
    await acuerdoPorFirmar(d.prestamoId, usuario.colaboradorId)
    await verificarCodigoFirma({ proposito: 'FIRMA_ACUERDO_DESCUENTO', referenciaId: d.prestamoId, userId: usuario.id, codigo: d.codigo })
    const r = await firmarAcuerdo({ prestamoId: d.prestamoId, firmaDataUri: d.firmaDataUri, usuarioId: usuario.id, metodoAuth: 'CODIGO_EMAIL' })
    revalidatePath('/autoservicio/descuentos')
    revalidatePath('/autoservicio')
    return r
  },
)
