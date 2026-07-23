'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { accion, ErrorNegocio } from '@/server/accion'
import { aplicarFirmaContratoOps } from '@/server/contratos-ops-firma'
import { aplicarFirmaContratoLaboral } from '@/server/contratos-laboral-firma'
import { generarYEnviarCodigoFirma, verificarCodigoFirma } from '@/server/firma/codigo-firma'
import { avisarPorRol } from '@/server/notificaciones/avisar'

/**
 * Confirma que el contrato existe y está a nombre del usuario en sesión.
 * Devuelve el colaboradorId ya validado (no nulo).
 */
async function contratoPropioOFalla(contratoId: string, colaboradorId: string | null): Promise<string> {
  if (!colaboradorId) throw new ErrorNegocio('Tu usuario no está vinculado a una ficha de colaborador.')
  const c = await prisma.contratoOps.findUnique({ where: { id: contratoId }, select: { colaboradorId: true } })
  if (!c || c.colaboradorId !== colaboradorId) throw new ErrorNegocio('Este contrato no está a tu nombre.')
  return colaboradorId
}

/**
 * Envía a mi correo un código de 6 dígitos para autorizar la firma de MI contrato
 * OPS. Es el paso previo a firmar: deja huella del consentimiento (Ley 527).
 */
export const solicitarCodigoFirmaContrato = accion(
  {
    modulo: 'autoservicio',
    accion: 'CREAR',
    schema: z.object({ contratoId: z.uuid() }),
  },
  async (d, usuario) => {
    await contratoPropioOFalla(d.contratoId, usuario.colaboradorId)
    const { email, vigenciaMin } = await generarYEnviarCodigoFirma({
      proposito: 'FIRMA_CONTRATO_OPS',
      referenciaId: d.contratoId,
      userId: usuario.id,
      email: usuario.email,
    })
    return { ok: true, email, vigenciaMin }
  },
)

/**
 * El contratista firma SU propio contrato OPS desde el autoservicio.
 * Solo puede firmar como CONTRATISTA y solo contratos vinculados a su ficha.
 * Exige el código de 6 dígitos enviado a su correo (autorización previa).
 */
export const firmarMiContratoOps = accion(
  {
    modulo: 'autoservicio',
    accion: 'CREAR',
    schema: z.object({
      contratoId: z.uuid(),
      firmaDataUri: z.string().min(1).startsWith('data:image/', 'Firma inválida'),
      codigo: z.string().regex(/^\d{6}$/, 'El código debe tener 6 dígitos.'),
    }),
  },
  async (d, usuario) => {
    const colaboradorId = await contratoPropioOFalla(d.contratoId, usuario.colaboradorId)

    // Autorización previa: valida el código enviado al correo antes de firmar.
    await verificarCodigoFirma({
      proposito: 'FIRMA_CONTRATO_OPS',
      referenciaId: d.contratoId,
      userId: usuario.id,
      codigo: d.codigo,
    })

    const { firmado, numero } = await aplicarFirmaContratoOps({
      contratoId: d.contratoId,
      rol: 'CONTRATISTA',
      firmaDataUri: d.firmaDataUri,
      usuarioId: usuario.id,
      metodoAuth: 'CODIGO_EMAIL',
    })

    // Avisar a administración que el contratista ya firmó.
    const colab = await prisma.colaborador.findUniqueOrThrow({ where: { id: colaboradorId }, select: { nombres: true, apellidos: true } })
    await avisarPorRol(['Administrador', 'Recursos Humanos', 'Subgerencia'], {
      evento: 'contrato_firmado',
      titulo: firmado ? 'Contrato OPS firmado por ambas partes' : 'El contratista firmó su contrato OPS',
      mensaje: `${colab.nombres} ${colab.apellidos} firmó el contrato ${numero} y la autorización de tratamiento de datos.${firmado ? ' El contrato firmado ya está disponible.' : ' Falta la firma del representante legal en el contrato.'}`,
      enlace: `/contratos/ops/${d.contratoId}`,
      llamadoAccion: 'Ver el contrato',
    })

    revalidatePath('/autoservicio/contratos')
    revalidatePath(`/contratos/ops/${d.contratoId}`)
    return { ok: true, firmado }
  },
)

/** Confirma que el contrato LABORAL existe y está a nombre del usuario en sesión. */
async function contratoLaboralPropioOFalla(contratoId: string, colaboradorId: string | null): Promise<string> {
  if (!colaboradorId) throw new ErrorNegocio('Tu usuario no está vinculado a una ficha de colaborador.')
  const c = await prisma.contrato.findUnique({ where: { id: contratoId }, select: { colaboradorId: true } })
  if (!c || c.colaboradorId !== colaboradorId) throw new ErrorNegocio('Este contrato no está a tu nombre.')
  return colaboradorId
}

/** Envía a mi correo el código de 6 dígitos para autorizar la firma de MI contrato laboral. */
export const solicitarCodigoFirmaContratoLaboral = accion(
  {
    modulo: 'autoservicio',
    accion: 'CREAR',
    schema: z.object({ contratoId: z.uuid() }),
  },
  async (d, usuario) => {
    await contratoLaboralPropioOFalla(d.contratoId, usuario.colaboradorId)
    const { email, vigenciaMin } = await generarYEnviarCodigoFirma({
      proposito: 'FIRMA_CONTRATO_LABORAL',
      referenciaId: d.contratoId,
      userId: usuario.id,
      email: usuario.email,
    })
    return { ok: true, email, vigenciaMin }
  },
)

/**
 * El empleado firma SU propio contrato laboral desde el autoservicio.
 * Solo puede firmar como EMPLEADO y solo contratos vinculados a su ficha.
 * Exige el código de 6 dígitos enviado a su correo (autorización previa).
 */
export const firmarMiContratoLaboral = accion(
  {
    modulo: 'autoservicio',
    accion: 'CREAR',
    schema: z.object({
      contratoId: z.uuid(),
      firmaDataUri: z.string().min(1).startsWith('data:image/', 'Firma inválida'),
      codigo: z.string().regex(/^\d{6}$/, 'El código debe tener 6 dígitos.'),
    }),
  },
  async (d, usuario) => {
    const colaboradorId = await contratoLaboralPropioOFalla(d.contratoId, usuario.colaboradorId)

    await verificarCodigoFirma({
      proposito: 'FIRMA_CONTRATO_LABORAL',
      referenciaId: d.contratoId,
      userId: usuario.id,
      codigo: d.codigo,
    })

    const { firmado, numero } = await aplicarFirmaContratoLaboral({
      contratoId: d.contratoId,
      rol: 'EMPLEADO',
      firmaDataUri: d.firmaDataUri,
      usuarioId: usuario.id,
      metodoAuth: 'CODIGO_EMAIL',
    })

    const colab = await prisma.colaborador.findUniqueOrThrow({ where: { id: colaboradorId }, select: { nombres: true, apellidos: true } })
    await avisarPorRol(['Administrador', 'Recursos Humanos', 'Subgerencia'], {
      evento: 'contrato_firmado',
      titulo: firmado ? 'Contrato laboral firmado por ambas partes' : 'El empleado firmó su contrato laboral',
      mensaje: `${colab.nombres} ${colab.apellidos} firmó el contrato ${numero} y la autorización de tratamiento de datos.${firmado ? ' El contrato firmado ya está disponible.' : ' Falta la firma del representante legal en el contrato.'}`,
      enlace: `/contratos/${d.contratoId}`,
      llamadoAccion: 'Ver el contrato',
    })

    revalidatePath('/autoservicio/contratos')
    revalidatePath(`/contratos/${d.contratoId}`)
    return { ok: true, firmado }
  },
)
