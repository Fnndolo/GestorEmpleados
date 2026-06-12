import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  // La CLI (migrate/studio) usa la conexión directa; el cliente en runtime usa
  // el driver adapter @prisma/adapter-pg con DATABASE_URL (ver src/lib/db.ts).
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL!,
  },
})
