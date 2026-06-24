'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { dbAuditado } from '@/lib/auditoria'
import { accion } from '@/server/accion'
import { cargoSchema, type CargoInput } from '@/lib/validaciones/catalogos'

function datosCargo(d: CargoInput) {
  return {
    nombre: d.nombre,
    areaId: d.areaId,
    activo: d.activo,
    nivel: d.nivel || null,
    funciones: d.funciones || null,
    claseRiesgoDefecto: d.claseRiesgoDefecto || null,
    rolDefectoId: d.rolDefectoId || null,
  }
}

export const crearCargo = accion(
  { modulo: 'configuracion', accion: 'CREAR', schema: cargoSchema },
  async (datos) => {
    await dbAuditado.cargo.create({ data: datosCargo(datos) })
    revalidatePath('/configuracion/cargos')
    return { ok: true }
  },
)

export const editarCargo = accion(
  { modulo: 'configuracion', accion: 'EDITAR', schema: cargoSchema.extend({ id: z.uuid() }) },
  async ({ id, ...resto }) => {
    // El cambio se refleja automáticamente en colaboradores y contratos que referencian este cargo (FK).
    await dbAuditado.cargo.update({ where: { id }, data: datosCargo(resto) })
    revalidatePath('/configuracion/cargos')
    return { ok: true }
  },
)

export const alternarCargo = accion(
  { modulo: 'configuracion', accion: 'EDITAR', schema: z.object({ id: z.uuid(), activo: z.boolean() }) },
  async ({ id, activo }) => {
    await dbAuditado.cargo.update({ where: { id }, data: { activo } })
    revalidatePath('/configuracion/cargos')
    return { ok: true }
  },
)
