import { PrismaClient } from '@/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

function crearCliente() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  return new PrismaClient({ adapter })
}

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof crearCliente> }

/** Cliente Prisma base (sin auditoría). Para mutaciones de negocio usar `dbAuditado` (src/lib/auditoria.ts). */
export const prisma = globalForPrisma.prisma ?? crearCliente()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
