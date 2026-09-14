import { PrismaClient } from '@/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

/** Operaciones que cambian datos: las que deben mover el latido del sistema. */
const ESCRITURAS = new Set(['create', 'createMany', 'createManyAndReturn', 'update', 'updateMany', 'updateManyAndReturn', 'upsert', 'delete', 'deleteMany'])

/**
 * Modelos cuyas escrituras NO cuentan como "cambió algo que alguien esté
 * mirando": sesiones, auditoría, mensajería y el propio latido. Si contaran,
 * cada inicio de sesión o cada aviso refrescaría todas las pantallas abiertas.
 */
const SIN_LATIDO = new Set([
  'LatidoSistema', 'AuditLog', 'Session', 'Account', 'Verification',
  'Notificacion', 'MensajeSaliente', 'SuscripcionPush', 'PreferenciaNotificacion', 'CodigoFirma',
])

/** Con qué frecuencia, como mucho, se escribe el latido por proceso. */
const LATIDO_CADA_MS = 1000

function crearCliente() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  const base = new PrismaClient({ adapter })

  // Latido del sistema: después de cualquier escritura de datos se anota la hora
  // en `latido_sistema`, que las pantallas abiertas consultan para refrescarse
  // solas. Va aquí, en el cliente base, para que cuente TODA escritura —las
  // auditadas (`dbAuditado`) y las directas del cron o la nómina—.
  //
  // Se escribe como parte de la misma petición (se espera), no en segundo
  // plano: sin servidor, el proceso se congela apenas responde y un trabajo
  // diferido puede no correr nunca. A cambio se agrupa: una vez por segundo por
  // proceso, que para una liquidación con miles de escrituras es una escritura
  // extra por segundo. Nunca tumba la operación real.
  let ultimoLatido = 0
  const marcarLatido = async () => {
    const ahora = Date.now()
    if (ahora - ultimoLatido < LATIDO_CADA_MS) return
    ultimoLatido = ahora
    try {
      await base.$executeRaw`UPDATE "latido_sistema" SET "cambio" = CURRENT_TIMESTAMP WHERE "id" = 1`
    } catch {
      // Sin latido, las pantallas se enteran en el siguiente cambio; no vale un error.
    }
  }

  return base.$extends({
    name: 'latido',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const resultado = await query(args)
          if (ESCRITURAS.has(operation) && !SIN_LATIDO.has(model)) await marcarLatido()
          return resultado
        },
      },
    },
  })
}

const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof crearCliente>
  /** Con qué clase se creó el cliente guardado: cambia cuando se regenera el cliente. */
  prismaClase?: unknown
}

/**
 * En desarrollo el cliente se guarda en `globalThis` para no abrir un pool por
 * cada recarga en caliente. Pero si se regeneró el cliente de Prisma (cambio de
 * esquema), el guardado sigue conociendo el esquema viejo y todo falla con
 * «Unknown argument» hasta reiniciar `pnpm dev`. La clase `PrismaClient` es
 * otra tras regenerar: si no coincide con la del guardado, se crea uno nuevo y
 * el viejo se cierra sin esperarlo.
 */
function clienteVigente() {
  const guardado = globalForPrisma.prisma
  if (guardado && globalForPrisma.prismaClase === PrismaClient) return guardado
  if (guardado) void guardado.$disconnect().catch(() => {})
  return crearCliente()
}

/** Cliente Prisma base (sin auditoría). Para mutaciones de negocio usar `dbAuditado` (src/lib/auditoria.ts). */
export const prisma = process.env.NODE_ENV === 'production' ? crearCliente() : clienteVigente()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
  globalForPrisma.prismaClase = PrismaClient
}
