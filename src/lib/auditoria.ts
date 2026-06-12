import { prisma } from '@/lib/db'
import { contextoActual } from '@/server/contexto'

/**
 * Auditoría automática (requerimiento general 2.5).
 *
 * Extensión de Prisma que registra create/update/delete con un diff JSON y el
 * usuario que ejecutó la mutación (tomado del contexto AsyncLocalStorage).
 * El registro se hace de forma awaited (no fire-and-forget) para que un fallo
 * de auditoría no pase desapercibido.
 *
 * Usar SIEMPRE `dbAuditado` para mutaciones de negocio. `prisma` (sin auditar)
 * queda para lecturas, el propio AuditLog y operaciones de Better Auth.
 */

// Modelos que NO se auditan (ruido o gestionados por su propio mecanismo)
const MODELOS_EXCLUIDOS = new Set([
  'AuditLog',
  'Session',
  'Account',
  'Verification',
  'Notificacion',
  'MensajeSaliente',
  'AlertaVencimiento',
])

// Campos sensibles que se redactan en el diff (Ley 1581 / credenciales)
const CAMPOS_REDACTADOS = new Set([
  'password',
  'accessToken',
  'refreshToken',
  'idToken',
  'token',
])

type Valor = unknown
type Diff = Record<string, { antes: Valor; despues: Valor }>

function redactar(campo: string, valor: Valor): Valor {
  return CAMPOS_REDACTADOS.has(campo) ? '«redactado»' : valor
}

function calcularDiff(antes: Record<string, Valor> | null, despues: Record<string, Valor>): Diff {
  const diff: Diff = {}
  const claves = new Set([...Object.keys(antes ?? {}), ...Object.keys(despues)])
  for (const clave of claves) {
    if (clave === 'actualizadoEn' || clave === 'updatedAt' || clave === 'creadoEn' || clave === 'createdAt') continue
    const a = antes?.[clave]
    const d = despues[clave]
    if (JSON.stringify(a) !== JSON.stringify(d)) {
      diff[clave] = { antes: redactar(clave, a), despues: redactar(clave, d) }
    }
  }
  return diff
}

function idDe(registro: unknown): string | null {
  if (registro && typeof registro === 'object' && 'id' in registro) {
    return String((registro as { id: unknown }).id)
  }
  return null
}

export const dbAuditado = prisma.$extends({
  name: 'auditoria',
  query: {
    $allModels: {
      async create({ model, args, query }) {
        const resultado = await query(args)
        if (!MODELOS_EXCLUIDOS.has(model)) {
          await registrar('CREAR', model, idDe(resultado), calcularDiff(null, resultado as Record<string, Valor>))
        }
        return resultado
      },
      async update({ model, args, query }) {
        const ctx = contextoActual()
        let antes: Record<string, Valor> | null = null
        if (!MODELOS_EXCLUIDOS.has(model)) {
          antes = (await (prisma as unknown as Record<string, { findUnique: (a: unknown) => Promise<unknown> }>)[
            decapitalizar(model)
          ].findUnique({ where: (args as { where: unknown }).where })) as Record<string, Valor> | null
        }
        const resultado = await query(args)
        if (!MODELOS_EXCLUIDOS.has(model)) {
          await registrar(
            'EDITAR',
            model,
            idDe(resultado),
            calcularDiff(antes, resultado as Record<string, Valor>),
            ctx,
          )
        }
        return resultado
      },
      async delete({ model, args, query }) {
        const ctx = contextoActual()
        let antes: Record<string, Valor> | null = null
        if (!MODELOS_EXCLUIDOS.has(model)) {
          antes = (await (prisma as unknown as Record<string, { findUnique: (a: unknown) => Promise<unknown> }>)[
            decapitalizar(model)
          ].findUnique({ where: (args as { where: unknown }).where })) as Record<string, Valor> | null
        }
        const resultado = await query(args)
        if (!MODELOS_EXCLUIDOS.has(model)) {
          await registrar('ELIMINAR', model, idDe(resultado) ?? idDe(antes), calcularDiff(antes, {}), ctx)
        }
        return resultado
      },
    },
  },
})

function decapitalizar(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1)
}

async function registrar(
  accion: 'CREAR' | 'EDITAR' | 'ELIMINAR',
  modelo: string,
  registroId: string | null,
  diff: Diff,
  ctx = contextoActual(),
) {
  // No registrar updates que no cambiaron nada de interés
  if (accion === 'EDITAR' && Object.keys(diff).length === 0) return
  await prisma.auditLog.create({
    data: {
      accion,
      modelo,
      registroId,
      diff: diff as object,
      userId: ctx.userId,
      userEmail: ctx.userEmail,
      ip: ctx.ip,
    },
  })
}

/**
 * Registra eventos manualmente (login, exportaciones, accesos a datos sensibles,
 * o mutaciones hechas fuera del cliente auditado como las de Better Auth).
 */
export async function auditar(
  accion: 'CREAR' | 'EDITAR' | 'ELIMINAR' | 'LOGIN' | 'LOGOUT' | 'ACCESO' | 'EXPORTAR',
  modelo: string,
  opts: { registroId?: string; descripcion?: string } = {},
) {
  const ctx = contextoActual()
  await prisma.auditLog.create({
    data: {
      accion,
      modelo,
      registroId: opts.registroId,
      descripcion: opts.descripcion,
      userId: ctx.userId,
      userEmail: ctx.userEmail,
      ip: ctx.ip,
    },
  })
}
