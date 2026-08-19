'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { accion } from '@/server/accion'

const v = (s: string | undefined | null) => (s && s !== '' ? s : null)

const plantillaSchema = z.object({
  nombre: z.string().trim().min(2).max(80),
  encabezado: z.string().max(2000).optional(),
  cuerpo: z.string().trim().min(5).max(4000),
  pieLegal: z.string().max(2000).optional(),
  esDefecto: z.boolean(),
})

export const crearPlantillaCC = accion(
  { modulo: 'configuracion', accion: 'CREAR', schema: plantillaSchema },
  async (d) => {
    if (d.esDefecto) await prisma.plantillaCuentaCobro.updateMany({ where: { esDefecto: true }, data: { esDefecto: false } })
    const p = await dbAuditado.plantillaCuentaCobro.create({
      data: { nombre: d.nombre, encabezado: v(d.encabezado), cuerpo: d.cuerpo, pieLegal: v(d.pieLegal), esDefecto: d.esDefecto },
    })
    revalidatePath('/configuracion/plantillas/cuentas-cobro')
    return { id: p.id }
  },
)

export const editarPlantillaCC = accion(
  { modulo: 'configuracion', accion: 'EDITAR', schema: plantillaSchema.extend({ id: z.uuid() }) },
  async (d) => {
    if (d.esDefecto) await prisma.plantillaCuentaCobro.updateMany({ where: { esDefecto: true, NOT: { id: d.id } }, data: { esDefecto: false } })
    await dbAuditado.plantillaCuentaCobro.update({
      where: { id: d.id },
      data: { nombre: d.nombre, encabezado: v(d.encabezado), cuerpo: d.cuerpo, pieLegal: v(d.pieLegal), esDefecto: d.esDefecto },
    })
    revalidatePath('/configuracion/plantillas/cuentas-cobro')
  },
)

export const eliminarPlantillaCC = accion(
  { modulo: 'configuracion', accion: 'ELIMINAR', schema: z.object({ id: z.uuid() }) },
  async ({ id }) => {
    await dbAuditado.plantillaCuentaCobro.delete({ where: { id } })
    revalidatePath('/configuracion/plantillas/cuentas-cobro')
  },
)
