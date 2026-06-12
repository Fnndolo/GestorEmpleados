'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { dbAuditado } from '@/lib/auditoria'
import { accion } from '@/server/accion'
import { generarOcurrencias } from '@/server/calendario/generador'
import { resolverVencimiento } from '@/server/vencimientos/servicio'
import { hoyBogota } from '@/lib/fechas'

export const completarOcurrencia = accion(
  { modulo: 'calendario_legal', accion: 'EDITAR', schema: z.object({ id: z.uuid(), observaciones: z.string().max(500).optional() }) },
  async ({ id, observaciones }) => {
    await dbAuditado.ocurrenciaObligacion.update({
      where: { id },
      data: { estado: 'CUMPLIDA', fechaCumplido: hoyBogota(), observaciones },
    })
    await resolverVencimiento('OcurrenciaObligacion', id, 'OBLIGACION_LEGAL')
    revalidatePath('/calendario-legal')
  },
)

export const generarCalendario = accion(
  { modulo: 'calendario_legal', accion: 'CREAR', schema: z.object({}) },
  async () => {
    const r = await generarOcurrencias(120)
    revalidatePath('/calendario-legal')
    return r
  },
)
