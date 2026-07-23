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
    // Si tiene contrato OPS vigente (activo o ya firmado), se vincula: activa la
    // verificación de seguridad social. FIRMADO es el estado normal en ejecución.
    const contrato = await prisma.contratoOps.findFirst({
      where: { colaboradorId: usuario.colaboradorId, estado: { in: ['ACTIVO', 'FIRMADO'] } },
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
      evento: 'cuenta_cobro_radicada',
      titulo: 'Nueva cuenta de cobro radicada',
      mensaje: `${colab.nombres} ${colab.apellidos} radicó la cuenta de cobro ${cuenta.numero} (periodo ${d.periodo}).${contrato ? ' Verifica el pago de seguridad social antes de aprobar.' : ''}`,
      enlace: contrato ? `/contratos/ops/${contrato.id}` : '/contratos/cuentas-cobro',
      llamadoAccion: 'Revisar la cuenta de cobro',
    })

    revalidatePath('/autoservicio/cuentas-cobro')
    return { id: cuenta.id }
  },
)

/**
 * El contratista ADJUNTA el soporte de su planilla PILA a su propia cuenta de
 * cobro (operador, periodo cotizado, IBC y el PDF/imagen se sube aparte con
 * entidadTipo 'CuentaCobroOps'). Solo carga: la VERIFICACIÓN (válida/inválida)
 * sigue siendo exclusiva de la empresa (registrarSoporteSs, permiso contratos),
 * y sin soporte VÁLIDO la cuenta no se aprueba ni se paga.
 */
export const adjuntarMiSoporteSs = accion(
  {
    modulo: 'autoservicio',
    accion: 'CREAR',
    schema: z.object({
      cuentaId: z.uuid(),
      periodoCotizado: z.string().regex(/^\d{4}-\d{2}$/, 'Periodo inválido (AAAA-MM)'),
      operador: z.string().trim().max(100).optional(),
      ibcDeclarado: z.coerce.number().min(0).optional(),
    }),
  },
  async (d, usuario) => {
    if (!usuario.colaboradorId) throw new ErrorNegocio('Tu usuario no está vinculado a una ficha de colaborador.')
    const cuenta = await prisma.cuentaCobroOps.findUniqueOrThrow({
      where: { id: d.cuentaId },
      include: { contratoOps: { select: { colaboradorId: true } }, soporteSs: true },
    })
    const dueno = cuenta.colaboradorId ?? cuenta.contratoOps?.colaboradorId
    if (dueno !== usuario.colaboradorId) throw new ErrorNegocio('Esta cuenta de cobro no es tuya.')
    if (!cuenta.contratoOpsId) throw new ErrorNegocio('Esta cuenta no está ligada a un contrato OPS; no requiere soporte de seguridad social.')
    if (cuenta.estado === 'APROBADA' || cuenta.estado === 'PAGADA' || cuenta.estado === 'RECHAZADA') {
      throw new ErrorNegocio('Esta cuenta ya fue resuelta; el soporte no se puede modificar.')
    }
    if (cuenta.soporteSs?.estadoVerificacion === 'VALIDA') {
      throw new ErrorNegocio('El soporte de esta cuenta ya fue verificado como válido.')
    }

    // Queda PENDIENTE: la empresa verifica. Se limpia cualquier verificación previa
    // (p. ej. una planilla anterior marcada inválida que se está corrigiendo).
    await dbAuditado.soporteSsOps.upsert({
      where: { cuentaCobroId: cuenta.id },
      create: {
        cuentaCobroId: cuenta.id,
        operador: d.operador || null,
        periodoCotizado: d.periodoCotizado,
        ibcDeclarado: d.ibcDeclarado ?? null,
        estadoVerificacion: 'PENDIENTE',
      },
      update: {
        operador: d.operador || null,
        periodoCotizado: d.periodoCotizado,
        ibcDeclarado: d.ibcDeclarado ?? null,
        estadoVerificacion: 'PENDIENTE',
        verificadoPorId: null,
        verificadoEn: null,
        observaciones: null,
      },
    })
    if (cuenta.estado !== 'EN_VERIFICACION_SS') {
      await dbAuditado.cuentaCobroOps.update({ where: { id: cuenta.id }, data: { estado: 'EN_VERIFICACION_SS' } })
    }

    const colab = await prisma.colaborador.findUniqueOrThrow({ where: { id: usuario.colaboradorId }, select: { nombres: true, apellidos: true } })
    await avisarPorRol(['Contador', 'Administrador', 'Subgerencia'], {
      evento: 'soporte_ss_adjuntado',
      titulo: 'Soporte de seguridad social por verificar',
      mensaje: `${colab.nombres} ${colab.apellidos} adjuntó la planilla PILA de la cuenta ${cuenta.numero} (periodo cotizado ${d.periodoCotizado}). Verifícala para poder aprobar el pago.`,
      enlace: `/contratos/ops/${cuenta.contratoOpsId}`,
      llamadoAccion: 'Verificar el soporte',
    })

    revalidatePath('/autoservicio/cuentas-cobro')
    revalidatePath('/contratos/cuentas-cobro')
    return { ok: true }
  },
)
