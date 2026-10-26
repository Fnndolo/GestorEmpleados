'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/db'
import { dbAuditado, auditar } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'
import { cargoSchema, type CargoInput } from '@/lib/validaciones/catalogos'

function datosCargo(d: CargoInput) {
  return {
    nombre: d.nombre,
    areaId: d.areaId,
    activo: d.activo,
    nivel: d.nivel || null,
    funciones: d.funciones || null,
    funcionesContrato: d.funcionesContrato && d.funcionesContrato.length > 0 ? d.funcionesContrato : Prisma.DbNull,
    claseRiesgoDefecto: d.claseRiesgoDefecto || null,
    rolDefectoId: d.rolDefectoId || null,
    requiereTarjetaProfesional: d.requiereTarjetaProfesional ?? false,
  }
}

export const crearCargo = accion(
  { modulo: 'configuracion', accion: 'CREAR', schema: cargoSchema },
  async (datos) => {
    await dbAuditado.cargo.create({ data: datosCargo(datos) })
    revalidatePath('/configuracion/cargos')
    // Los cargos alimentan los selectores de la ficha del colaborador y del
    // contrato: sin esto, uno recién creado no aparece hasta recargar a mano.
    revalidatePath('/', 'layout')
    return { ok: true }
  },
)

export const editarCargo = accion(
  { modulo: 'configuracion', accion: 'EDITAR', schema: cargoSchema.extend({ id: z.uuid() }) },
  async ({ id, ...resto }) => {
    // El cambio se refleja automáticamente en colaboradores y contratos que referencian este cargo (FK).
    await dbAuditado.cargo.update({ where: { id }, data: datosCargo(resto) })
    revalidatePath('/configuracion/cargos')
    // Los cargos alimentan los selectores de la ficha del colaborador y del
    // contrato: sin esto, uno recién creado no aparece hasta recargar a mano.
    revalidatePath('/', 'layout')
    return { ok: true }
  },
)

export const alternarCargo = accion(
  { modulo: 'configuracion', accion: 'EDITAR', schema: z.object({ id: z.uuid(), activo: z.boolean() }) },
  async ({ id, activo }) => {
    await dbAuditado.cargo.update({ where: { id }, data: { activo } })
    revalidatePath('/configuracion/cargos')
    // Los cargos alimentan los selectores de la ficha del colaborador y del
    // contrato: sin esto, uno recién creado no aparece hasta recargar a mano.
    revalidatePath('/', 'layout')
    return { ok: true }
  },
)

/**
 * Borra un cargo creado por error, con el motivo (queda en auditoría). Solo si
 * nadie lo tiene: con colaboradores o contratos el camino es desactivarlo.
 */
export const eliminarCargo = accion(
  { modulo: 'configuracion', accion: 'ELIMINAR', schema: z.object({ id: z.uuid(), motivo: z.string().trim().min(5, 'Explica por qué se elimina.').max(300) }) },
  async ({ id, motivo }) => {
    const cargo = await prisma.cargo.findUniqueOrThrow({
      where: { id },
      include: { _count: { select: { colaboradores: true, contratos: true, contratosOps: true, acuerdosEvaluacion: true } } },
    })
    const c = cargo._count
    const usos = [
      c.colaboradores > 0 ? `${c.colaboradores} colaborador(es)` : null,
      c.contratos + c.contratosOps > 0 ? `${c.contratos + c.contratosOps} contrato(s)` : null,
      c.acuerdosEvaluacion > 0 ? `${c.acuerdosEvaluacion} acuerdo(s) de evaluación` : null,
    ].filter(Boolean)
    if (usos.length) throw new ErrorNegocio(`No se puede eliminar: el cargo tiene ${usos.join(', ')}. Desactívalo en su lugar.`)
    await dbAuditado.cargo.delete({ where: { id } })
    await auditar('ELIMINAR', 'Cargo', { registroId: id, descripcion: `Anulado: ${motivo}` })
    revalidatePath('/configuracion/cargos')
    revalidatePath('/', 'layout')
    return { ok: true }
  },
)
