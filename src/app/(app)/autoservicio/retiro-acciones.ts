'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { accion, ErrorNegocio } from '@/server/accion'
import { esperaFirmaTrabajador, firmarDocumentoTrabajador, idDocumentoTerminacion, type TipoDocTerminacion } from '@/server/terminacion-documentos'
import { presentarRenuncia, retirarRenuncia, renderCartaRenuncia } from '@/server/renuncias'
import { marcarAreaPazYSalvo } from '@/server/paz-y-salvo-areas'
import { generarYEnviarCodigoFirma, verificarCodigoFirma } from '@/server/firma/codigo-firma'
import { parseFechaISO } from '@/lib/fechas'

/**
 * Lo que el trabajador hace de su retiro desde el autoservicio: firmar los
 * documentos que le envía Talento Humano (carta, acta de paz y salvo, recibido
 * de la liquidación) y presentar o retirar su renuncia. También, para quien es
 * responsable de un área del paz y salvo, verificar la entrega de otros.
 *
 * Firmar exige \`autoservicio: VER\` y no CREAR a propósito: quien firma ya está
 * retirado y su rol es de solo consulta. Son las únicas firmas que ese rol
 * puede hacer, y solo sobre su propia terminación. Todas llevan código de 6
 * dígitos al correo como autorización previa (Ley 527).
 */

const TIPO = z.enum(['CARTA', 'PAZ_Y_SALVO', 'LIQUIDACION'])
const PROPOSITO = { CARTA: 'FIRMA_CARTA_TERMINACION', PAZ_Y_SALVO: 'FIRMA_PAZ_Y_SALVO', LIQUIDACION: 'FIRMA_LIQUIDACION' } as const

async function documentoPropioOFalla(tipo: TipoDocTerminacion, terminacionId: string, colaboradorId: string | null): Promise<string> {
  if (!colaboradorId) throw new ErrorNegocio('Tu usuario no está vinculado a una ficha de colaborador.')
  const t = await prisma.terminacion.findUnique({ where: { id: terminacionId }, select: { colaboradorId: true } })
  if (!t || t.colaboradorId !== colaboradorId) throw new ErrorNegocio('Este documento no está a tu nombre.')
  if (!(await esperaFirmaTrabajador(tipo, terminacionId))) throw new ErrorNegocio('Este documento no está esperando tu firma.')
  return idDocumentoTerminacion(tipo, terminacionId)
}

export const solicitarCodigoFirmaRetiro = accion(
  { modulo: 'autoservicio', accion: 'VER', schema: z.object({ terminacionId: z.uuid(), tipo: TIPO }) },
  async (d, usuario) => {
    const referenciaId = await documentoPropioOFalla(d.tipo, d.terminacionId, usuario.colaboradorId)
    return generarYEnviarCodigoFirma({ proposito: PROPOSITO[d.tipo], referenciaId, userId: usuario.id, email: usuario.email })
  },
)

export const firmarDocumentoRetiro = accion(
  {
    modulo: 'autoservicio',
    accion: 'VER',
    schema: z.object({
      terminacionId: z.uuid(),
      tipo: TIPO,
      firmaDataUri: z.string().min(1).startsWith('data:image/', 'Firma inválida'),
      codigo: z.string().regex(/^\d{6}$/, 'El código debe tener 6 dígitos.'),
    }),
  },
  async (d, usuario) => {
    const referenciaId = await documentoPropioOFalla(d.tipo, d.terminacionId, usuario.colaboradorId)
    await verificarCodigoFirma({ proposito: PROPOSITO[d.tipo], referenciaId, userId: usuario.id, codigo: d.codigo })
    const r = await firmarDocumentoTrabajador({ tipo: d.tipo, terminacionId: d.terminacionId, firmaDataUri: d.firmaDataUri, usuarioId: usuario.id, metodoAuth: 'CODIGO_EMAIL' })
    revalidatePath('/autoservicio/retiro')
    revalidatePath('/autoservicio')
    return r
  },
)

// ── Renuncia ────────────────────────────────────────────────────────────────

function colaboradorOFalla(colaboradorId: string | null): string {
  if (!colaboradorId) throw new ErrorNegocio('Tu usuario no está vinculado a una ficha de colaborador.')
  return colaboradorId
}

/** Código al correo para firmar la carta de renuncia (la referencia es la propia ficha). */
export const solicitarCodigoRenuncia = accion(
  { modulo: 'autoservicio', accion: 'CREAR', schema: z.object({}) },
  async (_d, usuario) => {
    const colaboradorId = colaboradorOFalla(usuario.colaboradorId)
    return generarYEnviarCodigoFirma({ proposito: 'FIRMA_RENUNCIA', referenciaId: colaboradorId, userId: usuario.id, email: usuario.email })
  },
)

/** La carta tal como va a quedar (sin firma), para verla antes de firmarla. */
export const previsualizarMiRenuncia = accion(
  {
    modulo: 'autoservicio',
    accion: 'CREAR',
    schema: z.object({ fechaRetiro: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Indica tu último día.'), motivo: z.string().trim().max(500).optional() }),
  },
  async (d, usuario) => {
    const pdf = await renderCartaRenuncia(colaboradorOFalla(usuario.colaboradorId), parseFechaISO(d.fechaRetiro)!, d.motivo || null)
    return { pdfBase64: pdf.toString('base64') }
  },
)

export const presentarMiRenuncia = accion(
  {
    modulo: 'autoservicio',
    accion: 'CREAR',
    schema: z.object({
      fechaRetiro: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Indica tu último día.'),
      motivo: z.string().trim().max(500).optional(),
      firmaDataUri: z.string().min(1).startsWith('data:image/', 'Firma inválida'),
      codigo: z.string().regex(/^\d{6}$/, 'El código debe tener 6 dígitos.'),
    }),
  },
  async (d, usuario) => {
    const colaboradorId = colaboradorOFalla(usuario.colaboradorId)
    await verificarCodigoFirma({ proposito: 'FIRMA_RENUNCIA', referenciaId: colaboradorId, userId: usuario.id, codigo: d.codigo })
    const r = await presentarRenuncia({
      colaboradorId, usuarioId: usuario.id, fechaRetiro: parseFechaISO(d.fechaRetiro)!,
      motivo: d.motivo || null, firmaDataUri: d.firmaDataUri, metodoAuth: 'CODIGO_EMAIL',
    })
    revalidatePath('/autoservicio/retiro')
    return r
  },
)

export const retirarMiRenuncia = accion(
  { modulo: 'autoservicio', accion: 'VER', schema: z.object({ renunciaId: z.uuid() }) },
  async (d, usuario) => {
    await retirarRenuncia(d.renunciaId, colaboradorOFalla(usuario.colaboradorId))
    revalidatePath('/autoservicio/retiro')
  },
)

// ── Verificar entregas (responsables de área) ───────────────────────────────

export const verificarEntrega = accion(
  { modulo: 'autoservicio', accion: 'VER', schema: z.object({ itemId: z.uuid(), cumplido: z.boolean() }) },
  async (d, usuario) => {
    await marcarAreaPazYSalvo({ itemId: d.itemId, cumplido: d.cumplido, usuarioId: usuario.id, soloSuya: true })
    revalidatePath('/autoservicio/verificar-entregas')
  },
)
