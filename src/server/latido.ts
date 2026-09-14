import 'server-only'
import { prisma } from '@/lib/db'

/**
 * Hora de la última escritura de datos del sistema (ver `src/lib/db.ts`).
 * Devuelve un texto estable para comparar de un sondeo al siguiente.
 */
export async function ultimoCambio(): Promise<string> {
  const fila = await prisma.latidoSistema.findUnique({ where: { id: 1 }, select: { cambio: true } })
  return (fila?.cambio ?? new Date(0)).toISOString()
}
