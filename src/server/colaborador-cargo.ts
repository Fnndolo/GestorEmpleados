import 'server-only'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'

/**
 * Deja el cargo de la ficha del colaborador igual al del contrato que se acaba
 * de crear.
 *
 * El cargo vive en dos sitios: en la ficha (se pide, opcional, al crear al
 * colaborador) y en cada contrato. La ficha muestra el suyo, y un otrosí de
 * cambio de cargo ya se lo actualiza; pero el alta del contrato no lo hacía, así
 * que quien se creaba sin cargo seguía «Sin cargo» aunque su contrato lo dijera.
 * El área va con el cargo: cada cargo pertenece a una y la ficha exige que
 * coincidan.
 *
 * Devuelve el cambio hecho, o null si no había cargo o ya coincidía.
 */
export async function alinearCargoFicha(
  colaboradorId: string,
  cargoId: string | null | undefined,
): Promise<{ antes: string | null; ahora: string } | null> {
  if (!cargoId) return null
  const [colab, cargo] = await Promise.all([
    prisma.colaborador.findUnique({ where: { id: colaboradorId }, select: { cargoId: true, cargo: { select: { nombre: true } } } }),
    prisma.cargo.findUnique({ where: { id: cargoId }, select: { nombre: true, areaId: true } }),
  ])
  if (!colab || !cargo || colab.cargoId === cargoId) return null
  await dbAuditado.colaborador.update({
    where: { id: colaboradorId },
    data: { cargoId, areaId: cargo.areaId },
  })
  return { antes: colab.cargo?.nombre ?? null, ahora: cargo.nombre }
}
