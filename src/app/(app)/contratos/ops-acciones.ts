'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'
import { contratoOpsSchema, soporteSsSchema } from '@/lib/validaciones/contrato'
import { parseFechaISO } from '@/lib/fechas'

const v = (s: string | undefined | null) => (s && s !== '' ? s : null)

async function siguienteNumeroOps(): Promise<string> {
  const anio = new Date().getUTCFullYear()
  const total = await prisma.contratoOps.count()
  return `OPS-${anio}-${String(total + 1).padStart(4, '0')}`
}

export const crearContratoOps = accion(
  { modulo: 'contratos', accion: 'CREAR', schema: contratoOpsSchema },
  async (d) => {
    const numero = await siguienteNumeroOps()
    const c = await dbAuditado.contratoOps.create({
      data: {
        numero,
        colaboradorId: d.colaboradorId,
        objeto: d.objeto,
        valorTotal: d.valorTotal,
        valorMensual: d.valorMensual ?? null,
        supervisorId: v(d.supervisorId),
        sedeId: d.sedeId,
        fechaInicio: parseFechaISO(d.fechaInicio)!,
        fechaFin: parseFechaISO(d.fechaFin)!,
        rut: v(d.rut),
        estado: 'ACTIVO',
      },
    })
    revalidatePath('/contratos')
    return { id: c.id }
  },
)

// Las cuentas de cobro las radica el propio contratista desde su autoservicio
// (ver crearMiCuentaCobro). El administrador solo las revisa, verifica la seguridad
// social y las aprueba/rechaza/paga (registrarSoporteSs, cambiarEstadoCuenta).

export const registrarSoporteSs = accion(
  { modulo: 'contratos', accion: 'EDITAR', schema: soporteSsSchema },
  async (d, usuario) => {
    const cuenta = await prisma.cuentaCobroOps.findUniqueOrThrow({
      where: { id: d.cuentaCobroId },
      include: { contratoOps: true },
    })
    // Validación IBC ≥ 40% del valor mensualizado (Ley 1955 art. 244), tolerancia 1%
    const base = Number(cuenta.contratoOps.valorMensual ?? cuenta.valor)
    if (d.ibcDeclarado != null && base > 0) {
      const minimo = base * 0.4 * 0.99
      if (d.estadoVerificacion === 'VALIDA' && d.ibcDeclarado < minimo) {
        throw new ErrorNegocio('El IBC declarado es menor al 40% del valor mensualizado. No puede marcarse como válido.')
      }
    }
    await dbAuditado.soporteSsOps.upsert({
      where: { cuentaCobroId: d.cuentaCobroId },
      create: {
        cuentaCobroId: d.cuentaCobroId,
        operador: v(d.operador),
        periodoCotizado: d.periodoCotizado,
        ibcDeclarado: d.ibcDeclarado ?? null,
        estadoVerificacion: d.estadoVerificacion,
        verificadoPorId: usuario.id,
        verificadoEn: new Date(),
        observaciones: v(d.observaciones),
      },
      update: {
        operador: v(d.operador),
        periodoCotizado: d.periodoCotizado,
        ibcDeclarado: d.ibcDeclarado ?? null,
        estadoVerificacion: d.estadoVerificacion,
        verificadoPorId: usuario.id,
        verificadoEn: new Date(),
        observaciones: v(d.observaciones),
      },
    })
    // Si el soporte es válido y la cuenta estaba bloqueada, pasarla a EN_VERIFICACION
    if (d.estadoVerificacion === 'VALIDA' && cuenta.estado === 'BLOQUEADA_SS') {
      await prisma.cuentaCobroOps.update({ where: { id: cuenta.id }, data: { estado: 'EN_VERIFICACION_SS' } })
    }
    revalidatePath('/contratos/ops')
    return { ok: true }
  },
)

export const cambiarEstadoCuenta = accion(
  {
    modulo: 'contratos',
    accion: 'APROBAR',
    schema: z.object({
      id: z.uuid(),
      estado: z.enum(['EN_VERIFICACION_SS', 'BLOQUEADA_SS', 'APROBADA', 'PAGADA', 'RECHAZADA']),
      fechaPago: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
    }),
  },
  async (d) => {
    const cuenta = await prisma.cuentaCobroOps.findUniqueOrThrow({
      where: { id: d.id },
      include: { soporteSs: true },
    })
    // Regla legal: no se puede aprobar/pagar sin soporte de SS válido
    if ((d.estado === 'APROBADA' || d.estado === 'PAGADA') && cuenta.soporteSs?.estadoVerificacion !== 'VALIDA') {
      throw new ErrorNegocio('No se puede aprobar ni pagar sin el soporte de seguridad social verificado como válido.')
    }
    await dbAuditado.cuentaCobroOps.update({
      where: { id: d.id },
      data: {
        estado: d.estado,
        fechaPago: d.estado === 'PAGADA' && d.fechaPago ? parseFechaISO(d.fechaPago) : cuenta.fechaPago,
      },
    })
    revalidatePath('/contratos/ops')
    return { ok: true }
  },
)
