import 'server-only'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'

export const ROL_CONSULTA = 'Consulta (retirado)'

/**
 * Rol de solo lectura para personas desvinculadas: pueden entrar a ver SU
 * historial (autoservicio, su ficha, sus documentos y desprendibles — habeas
 * data), pero no crear solicitudes, radicar cuentas, firmar ni subir nada.
 * Reversible: al recontratar, RRHH reasigna el rol normal.
 */
async function obtenerRolConsulta(): Promise<string> {
  const existente = await prisma.rol.findUnique({ where: { nombre: ROL_CONSULTA } })
  if (existente) return existente.id
  const rol = await dbAuditado.rol.create({
    data: {
      nombre: ROL_CONSULTA,
      descripcion: 'Exempleado/excontratista: acceso de solo consulta a su propio historial (habeas data). Sin acciones que interfieran con la operación.',
      esSistema: true,
      permisos: {
        createMany: {
          data: [
            { modulo: 'autoservicio', accion: 'VER', alcance: 'PROPIO' },
            { modulo: 'colaboradores', accion: 'VER', alcance: 'PROPIO' },
            { modulo: 'documentos', accion: 'VER', alcance: 'PROPIO' },
          ],
        },
      },
    },
  })
  return rol.id
}

/**
 * Pasa el usuario del colaborador al rol de solo consulta, únicamente si no le
 * queda ningún vínculo vigente (contrato laboral activo u OPS en ejecución).
 * Devuelve true si se restringió el acceso.
 */
export async function restringirAccesoSiSinVinculo(colaboradorId: string): Promise<boolean> {
  const colab = await prisma.colaborador.findUnique({
    where: { id: colaboradorId },
    select: { usuarioId: true, usuario: { select: { rol: { select: { nombre: true } } } } },
  })
  if (!colab?.usuarioId) return false
  if (colab.usuario?.rol?.nombre === ROL_CONSULTA) return false // ya restringido

  const [laborales, ops] = await Promise.all([
    prisma.contrato.count({ where: { colaboradorId, estado: 'ACTIVO' } }),
    prisma.contratoOps.count({ where: { colaboradorId, estado: { in: ['ACTIVO', 'FIRMADO'] } } }),
  ])
  if (laborales > 0 || ops > 0) return false // conserva otro vínculo vigente

  const rolId = await obtenerRolConsulta()
  await dbAuditado.user.update({ where: { id: colab.usuarioId }, data: { rolId } })
  return true
}
