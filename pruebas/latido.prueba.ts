import { describe, it, expect, beforeAll } from 'vitest'

const { prisma } = await import('@/lib/db')
const { ultimoCambio } = await import('@/server/latido')

/**
 * El latido del sistema: la hora de la última escritura de datos, que las
 * pantallas abiertas consultan para refrescarse solas. Se prueba contra la base
 * porque vive en el cliente de Prisma: si una escritura no lo mueve, nadie se
 * entera del cambio hasta recargar; y si lo mueven las sesiones o los avisos,
 * todas las pantallas se refrescarían por nada.
 */

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))
let colaboradorId: string
let userId: string

beforeAll(async () => {
  const c = await prisma.colaborador.findFirstOrThrow({ where: { usuarioId: { not: null } }, select: { id: true, usuarioId: true } })
  colaboradorId = c.id
  userId = c.usuarioId!
})

/** Una escritura de negocio que no cambia nada visible: reescribe un campo con su propio valor. */
async function escrituraDeNegocio() {
  const c = await prisma.colaborador.findUniqueOrThrow({ where: { id: colaboradorId }, select: { busquedaNormalizada: true } })
  await prisma.colaborador.update({ where: { id: colaboradorId }, data: { busquedaNormalizada: c.busquedaNormalizada } })
}

describe('latido del sistema', () => {
  it('se mueve con una escritura de datos', async () => {
    await espera(1100) // fuera de la ventana de agrupación de cualquier escritura previa
    const antes = await ultimoCambio()
    await escrituraDeNegocio()
    const despues = await ultimoCambio()
    expect(despues > antes).toBe(true)
  })

  it('no se mueve con sesiones ni avisos', async () => {
    await espera(1100)
    const antes = await ultimoCambio()
    const n = await prisma.notificacion.create({ data: { userId, titulo: 'PRUEBA latido', mensaje: 'no debe mover el latido', dedupeKey: `prueba-latido-${Date.now()}` } })
    await prisma.notificacion.delete({ where: { id: n.id } })
    expect(await ultimoCambio()).toBe(antes)
  })

  it('agrupa las escrituras de un mismo segundo en un solo latido', async () => {
    await espera(1100)
    const antes = await ultimoCambio()
    await escrituraDeNegocio()
    const primera = await ultimoCambio()
    await escrituraDeNegocio()
    await escrituraDeNegocio()
    const seguidas = await ultimoCambio()
    expect(primera > antes).toBe(true)
    expect(seguidas).toBe(primera)

    // Pasado el segundo, una escritura nueva vuelve a moverlo.
    await espera(1100)
    await escrituraDeNegocio()
    expect((await ultimoCambio()) > seguidas).toBe(true)
  })
})
