import 'dotenv/config'
import { seedNomina } from './seed-nomina'

/**
 * Siembra SOLO los catálogos de nómina (parámetros legales, tipos de hora y
 * conceptos) sobre una base que ya existe, sin tocar el resto del seed.
 *
 * Hace falta porque el seed completo nunca corrió contra producción: sin SMMLV
 * vigente no se puede liquidar nómina ni calcular una terminación. `seedNomina`
 * comprueba antes de crear, así que correrlo dos veces no duplica nada.
 *
 *   DATABASE_URL="<url>" pnpm exec tsx prisma/seed-solo-nomina.ts
 */
const url = process.env.DATABASE_URL ?? ''
console.log('Sembrando contra:', url.replace(/:[^:@]*@/, ':****@'))

seedNomina()
  .then(() => console.log('Listo.'))
  .catch((e) => { console.error(e); process.exitCode = 1 })
