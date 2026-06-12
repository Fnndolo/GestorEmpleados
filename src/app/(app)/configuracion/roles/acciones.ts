'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { auditar } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'
import { rolSchema, matrizPermisosSchema } from '@/lib/validaciones/usuarios'

export const crearRol = accion(
  { modulo: 'usuarios', accion: 'CREAR', schema: rolSchema },
  async (datos) => {
    const existe = await prisma.rol.findUnique({ where: { nombre: datos.nombre } })
    if (existe) throw new ErrorNegocio('Ya existe un rol con ese nombre.')
    const rol = await dbAuditado.rol.create({
      data: { nombre: datos.nombre, descripcion: datos.descripcion || null, esSistema: false },
    })
    revalidatePath('/configuracion/roles')
    return { id: rol.id }
  },
)

export const editarRol = accion(
  { modulo: 'usuarios', accion: 'EDITAR', schema: rolSchema.extend({ id: z.uuid() }) },
  async (datos) => {
    await dbAuditado.rol.update({
      where: { id: datos.id },
      data: { nombre: datos.nombre, descripcion: datos.descripcion || null },
    })
    revalidatePath('/configuracion/roles')
  },
)

export const eliminarRol = accion(
  { modulo: 'usuarios', accion: 'ELIMINAR', schema: z.object({ id: z.uuid() }) },
  async ({ id }) => {
    const rol = await prisma.rol.findUniqueOrThrow({ where: { id }, include: { _count: { select: { usuarios: true } } } })
    if (rol.esSistema) throw new ErrorNegocio('Los roles del sistema no se pueden eliminar.')
    if (rol._count.usuarios > 0) throw new ErrorNegocio('No puedes eliminar un rol con usuarios asignados.')
    await dbAuditado.rol.delete({ where: { id } })
    revalidatePath('/configuracion/roles')
  },
)

export const guardarMatriz = accion(
  { modulo: 'usuarios', accion: 'EDITAR', schema: matrizPermisosSchema },
  async (datos) => {
    await prisma.$transaction([
      prisma.rolPermiso.deleteMany({ where: { rolId: datos.rolId } }),
      prisma.rolPermiso.createMany({
        data: datos.permisos.map((p) => ({
          rolId: datos.rolId,
          modulo: p.modulo,
          accion: p.accion,
          alcance: p.alcance,
        })),
      }),
    ])
    await auditar('EDITAR', 'RolPermiso', {
      registroId: datos.rolId,
      descripcion: `Matriz de permisos actualizada (${datos.permisos.length} permisos)`,
    })
    revalidatePath('/configuracion/roles')
  },
)
