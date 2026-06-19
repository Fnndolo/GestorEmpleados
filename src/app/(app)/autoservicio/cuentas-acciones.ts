'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'
import { parseFechaISO, hoyBogota } from '@/lib/fechas'
import { generarPdfCuentaCobro } from '@/server/cuentas-cobro'
import { avisarPorRol } from '@/server/notificaciones/avisar'

/** Cualquier colaborador crea y envía su propia cuenta de cobro (OPS o, p. ej., comisiones/saldos). */
export const crearMiCuentaCobro = accion(
  {
    modulo: 'autoservicio',
    accion: 'CREAR',
    schema: z.object({
      periodo: z.string().regex(/^\d{4}-\d{2}$/, 'Periodo inválido (AAAA-MM)'),
      valor: z.coerce.number().min(1),
      concepto: z.string().trim().max(200).optional(),
      plantillaId: z.union([z.uuid(), z.literal('')]).optional(),
      firmaDataUri: z.string().optional(),
    }),
  },
  async (d, usuario) => {
    if (!usuario.colaboradorId) throw new ErrorNegocio('Tu usuario no está vinculado a una ficha de colaborador.')
    // Si tiene contrato OPS activo, se vincula (activa la verificación de seguridad social)
    const contrato = await prisma.contratoOps.findFirst({
      where: { colaboradorId: usuario.colaboradorId, estado: 'ACTIVO' },
      orderBy: { fechaInicio: 'desc' },
    })

    const dup = await prisma.cuentaCobroOps.findFirst({ where: { colaboradorId: usuario.colaboradorId, periodo: d.periodo } })
    if (dup) throw new ErrorNegocio('Ya tienes una cuenta de cobro para ese periodo.')

    const total = await prisma.cuentaCobroOps.count({ where: { colaboradorId: usuario.colaboradorId } })
    const cuenta = await dbAuditado.cuentaCobroOps.create({
      data: {
        colaboradorId: usuario.colaboradorId, contratoOpsId: contrato?.id ?? null,
        numero: `CC-${total + 1}`, periodo: d.periodo, concepto: d.concepto || null,
        valor: d.valor, fechaRadicacion: hoyBogota(), estado: 'RADICADA', creadaPorContratista: true,
      },
    })

    // Generar el PDF desde la plantilla elegida (o la de defecto), con firma opcional
    await generarPdfCuentaCobro(cuenta.id, d.plantillaId || null, usuario.id, d.firmaDataUri || null)

    // Avisar a contabilidad y gerencia
    const colab = await prisma.colaborador.findUniqueOrThrow({ where: { id: usuario.colaboradorId }, select: { nombres: true, apellidos: true } })
    await avisarPorRol(['Contador', 'Administrador', 'Subgerencia'], {
      titulo: 'Nueva cuenta de cobro radicada',
      mensaje: `${colab.nombres} ${colab.apellidos} radicó la cuenta de cobro ${cuenta.numero} (periodo ${d.periodo}).${contrato ? ' Verifica el pago de seguridad social antes de aprobar.' : ''}`,
      enlace: contrato ? `/contratos/ops/${contrato.id}` : '/contratos/cuentas-cobro',
      llamadoAccion: 'Revisar la cuenta de cobro',
    })

    revalidatePath('/autoservicio/cuentas-cobro')
    return { id: cuenta.id }
  },
)
