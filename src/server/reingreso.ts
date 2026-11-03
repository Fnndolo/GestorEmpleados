import 'server-only'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { devolverAccesoNormal } from '@/server/rol-consulta'

/**
 * Devuelve a la vida la ficha de quien se está recontratando.
 *
 * Terminar hace tres cosas —marca la ficha como retirada, cierra el contrato y
 * baja el acceso a solo consulta— y crear el contrato nuevo solo deshacía la
 * segunda. La persona quedaba con contrato vigente pero marcada como retirada,
 * viendo en su autoservicio «tu vínculo laboral no está activo» y sin poder
 * pedir vacaciones ni firmar el contrato que se le acababa de hacer.
 *
 * También cuando la ficha sigue activa pero tiene un retiro registrado (una
 * terminación abierta) y el contrato nuevo empieza DESPUÉS de ese retiro: es un
 * reingreso, y con la fecha de retiro puesta la nómina lo dejaría por fuera. Un
 * contrato que empieza antes del retiro es el que se está terminando: no reactiva.
 *
 * Devuelve qué se reactivó, o null si no había nada que reactivar.
 */
export async function reactivarSiEstabaRetirado(
  colaboradorId: string,
  inicioContrato: Date,
): Promise<{ accesoDevuelto: boolean } | null> {
  const colab = await prisma.colaborador.findUnique({
    where: { id: colaboradorId },
    select: { estado: true, fechaRetiro: true },
  })
  if (!colab) return null
  const reingreso = !!colab.fechaRetiro && inicioContrato > colab.fechaRetiro
  if (colab.estado === 'ACTIVO' && !reingreso) return null

  await dbAuditado.colaborador.update({
    where: { id: colaboradorId },
    // La fecha de retiro se limpia: dejarla haría que la antigüedad y las
    // liquidaciones siguieran contando contra un retiro que ya no existe.
    data: { estado: 'ACTIVO', fechaRetiro: null },
  })
  const accesoDevuelto = await devolverAccesoNormal(colaboradorId)
  revalidatePath(`/colaboradores/${colaboradorId}`)
  revalidatePath('/autoservicio')
  return { accesoDevuelto }
}
