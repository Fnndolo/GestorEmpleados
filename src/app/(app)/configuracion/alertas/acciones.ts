'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { dbAuditado } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'
import { prisma } from '@/lib/db'
import { ORIGENES_ALERTA, ETIQUETA_ORIGEN } from '@/lib/origenes-vencimiento'
import { reaplicarReglaAlerta } from '@/server/vencimientos/servicio'

const diasSchema = {
  diasPrimeraAlerta: z.coerce.number().int().min(0).max(365),
  primeraEnHabiles: z.boolean(),
  diasUltimaAlerta: z.coerce.number().int().min(0).max(365),
  ultimaEnHabiles: z.boolean(),
}

const reglaSchema = z.object({ id: z.uuid(), ...diasSchema })

export const guardarReglaAlerta = accion(
  { modulo: 'configuracion', accion: 'EDITAR', schema: reglaSchema },
  async (d) => {
    await dbAuditado.reglaAlerta.update({
      where: { id: d.id },
      data: {
        diasPrimeraAlerta: d.diasPrimeraAlerta,
        primeraEnHabiles: d.primeraEnHabiles,
        diasUltimaAlerta: d.diasUltimaAlerta,
        ultimaEnHabiles: d.ultimaEnHabiles,
      },
    })
    // Los vencimientos ya publicados tienen sus alertas materializadas con la
    // regla anterior: se reprograman para que el cambio sirva de algo hoy.
    const regla = await prisma.reglaAlerta.findUniqueOrThrow({ where: { id: d.id } })
    const reprogramados = await reaplicarReglaAlerta(regla.clave)
    revalidatePath('/configuracion/alertas')
    return { reprogramados }
  },
)

/**
 * Crea la regla propia de un tipo de vencimiento. Mientras no exista, ese tipo
 * usa la regla GLOBAL; al crearla, empieza a mandar la suya.
 */
export const crearReglaAlerta = accion(
  {
    modulo: 'configuracion',
    accion: 'CREAR',
    schema: z.object({
      clave: z.enum(ORIGENES_ALERTA),
      ...diasSchema,
    }),
  },
  async (d) => {
    const existe = await prisma.reglaAlerta.findUnique({ where: { clave: d.clave } })
    if (existe) throw new ErrorNegocio(`${ETIQUETA_ORIGEN[d.clave]} ya tiene su propia regla.`)
    await dbAuditado.reglaAlerta.create({
      data: {
        clave: d.clave,
        descripcion: ETIQUETA_ORIGEN[d.clave],
        diasPrimeraAlerta: d.diasPrimeraAlerta,
        primeraEnHabiles: d.primeraEnHabiles,
        diasUltimaAlerta: d.diasUltimaAlerta,
        ultimaEnHabiles: d.ultimaEnHabiles,
      },
    })
    const reprogramados = await reaplicarReglaAlerta(d.clave)
    revalidatePath('/configuracion/alertas')
    return { reprogramados }
  },
)

/**
 * Borra la regla de un tipo, que vuelve así a heredar la GLOBAL. La regla
 * GLOBAL no se puede borrar: sin ella no habría con qué calcular las alertas
 * de los tipos que no tienen la suya.
 */
export const eliminarReglaAlerta = accion(
  { modulo: 'configuracion', accion: 'ELIMINAR', schema: z.object({ id: z.uuid() }) },
  async ({ id }) => {
    const regla = await prisma.reglaAlerta.findUnique({ where: { id } })
    if (!regla) return
    if (regla.clave === 'GLOBAL') throw new ErrorNegocio('La regla global no se puede eliminar; los demás tipos dependen de ella.')
    await dbAuditado.reglaAlerta.delete({ where: { id } })
    // Ese tipo vuelve a la global: sus alertas se recalculan con ella.
    await reaplicarReglaAlerta(regla.clave)
    revalidatePath('/configuracion/alertas')
  },
)
