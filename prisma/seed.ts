/**
 * Seed inicial: roles del sistema + matriz de permisos, configuración de empresa,
 * catálogos, parámetros legales y usuario administrador. NO siembra ciudades ni
 * sedes: producción arranca en blanco y el admin crea su sede real desde la app
 * (Configuración → Sedes). El demo (seed-demo.ts) crea las suyas por su cuenta.
 *
 * Idempotente: puede ejecutarse varias veces sin duplicar datos.
 * Uso: pnpm db:seed
 */
import 'dotenv/config'
import { randomBytes } from 'node:crypto'
import { prisma } from '../src/lib/db'
import { ROLES_SEED } from '../src/lib/permisos/modulos'
import { seedCatalogos } from './seed-catalogos'
import { seedNomina } from './seed-nomina'
import { seedObligaciones } from './seed-obligaciones'
import { seedMatrizLegal } from './seed-matriz-legal'
import { seedPlantillasContrato } from './seed-plantillas'
import { seedPlantillaLaboral } from './seed-plantilla-laboral'

// El admin inicial se configura por variables de entorno. NUNCA hay una
// contraseña por defecto en el código (sería un secreto commiteado al repo):
// si no se define SEED_ADMIN_PASSWORD, se genera una aleatoria y se imprime en
// consola al crear el admin.
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@ejemplo.local'
const ADMIN_NAME = process.env.SEED_ADMIN_NAME ?? 'Administrador'
// Contraseña generada al vuelo si no viene por variable (no queda ningún secreto
// en el repositorio). Se muestra en consola solo cuando se autogenera.
const ADMIN_PASSWORD_AUTOGENERADA = !process.env.SEED_ADMIN_PASSWORD
const ADMIN_PASSWORD_INICIAL =
  process.env.SEED_ADMIN_PASSWORD ?? `Adm-${randomBytes(9).toString('base64').replace(/[+/=]/g, '')}9*`
// El cambio de contraseña al primer ingreso se fuerza por defecto (seguro);
// pon SEED_ADMIN_FORCE_CHANGE=false solo en desarrollo si te estorba.
const ADMIN_FORZAR_CAMBIO = process.env.SEED_ADMIN_FORCE_CHANGE !== 'false'

async function seedRoles() {
  for (const [nombre, def] of Object.entries(ROLES_SEED)) {
    const rol = await prisma.rol.upsert({
      where: { nombre },
      create: { nombre, descripcion: def.descripcion, esSistema: true },
      update: { descripcion: def.descripcion, esSistema: true },
    })
    // La matriz solo se siembra si el rol no tiene permisos (no pisar ediciones del admin)
    const existentes = await prisma.rolPermiso.count({ where: { rolId: rol.id } })
    if (existentes === 0) {
      await prisma.rolPermiso.createMany({
        data: def.permisos.flatMap((p) =>
          p.acciones.map((accion) => ({
            rolId: rol.id,
            modulo: p.modulo,
            accion,
            alcance: p.alcance,
          })),
        ),
      })
    }
    console.log(`Rol listo: ${nombre}`)
  }
}

async function seedEmpresa() {
  const existe = await prisma.configuracionEmpresa.findFirst()
  if (!existe) {
    await prisma.configuracionEmpresa.create({
      data: {
        razonSocial: 'KUPOCELL S.A.S.',
        nombreComercial: 'Smart Gadgets',
        nit: 'Por definir',
        representanteLegal: 'Por definir',
      },
    })
  }
  console.log('Configuración de empresa lista')
}

async function seedAdmin() {
  const existente = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } })
  if (existente) {
    console.log(`Usuario administrador ya existe: ${ADMIN_EMAIL}`)
    return
  }
  const rolAdmin = await prisma.rol.findUniqueOrThrow({ where: { nombre: 'Administrador' } })

  // La instancia de Better Auth se importa aquí (lazy) para que el seed de datos
  // no dependa de variables de auth si solo se quieren sembrar catálogos.
  const { auth } = await import('../src/lib/auth')
  const creado = await auth.api.createUser({
    body: {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD_INICIAL,
      name: ADMIN_NAME,
      role: 'admin',
      data: {
        rolId: rolAdmin.id,
        estado: 'ACTIVO',
        debeCambiarPassword: ADMIN_FORZAR_CAMBIO,
      },
    },
  })
  console.log(`Usuario administrador creado: ${creado.user.email}`)
  if (ADMIN_PASSWORD_AUTOGENERADA) {
    console.log(`  ⚠️  Contraseña autogenerada (no se definió SEED_ADMIN_PASSWORD): ${ADMIN_PASSWORD_INICIAL}`)
    console.log('     Anótala ahora; no se vuelve a mostrar. En producción define SEED_ADMIN_PASSWORD.')
  } else {
    console.log(`  Contraseña inicial tomada de SEED_ADMIN_PASSWORD${ADMIN_FORZAR_CAMBIO ? ' (se exigirá cambiarla al primer ingreso)' : ''}.`)
  }
}

async function seedPlantillaCuentaCobro() {
  const existe = await prisma.plantillaCuentaCobro.findFirst()
  if (!existe) {
    await prisma.plantillaCuentaCobro.create({
      data: {
        nombre: 'Servicios (general)',
        esDefecto: true,
        encabezado: 'Señores {{empresa}} (NIT {{nit}}). {{ciudad}}.',
        cuerpo:
          'Por concepto de {{concepto}} correspondiente al periodo {{periodo}}, por valor de {{valor}}. ' +
          'Declaro que me encuentro al día en el pago de mis aportes al Sistema de Seguridad Social Integral como trabajador independiente, conforme a la ley.',
        pieLegal: 'Esta cuenta de cobro se expide para los fines tributarios y contables correspondientes.',
      },
    })
  }
  console.log('Plantilla de cuenta de cobro por defecto lista')
}

async function seedReglasAlerta() {
  const reglas = [
    {
      clave: 'GLOBAL',
      descripcion: 'Regla por defecto para todos los vencimientos',
      diasPrimeraAlerta: 10, primeraEnHabiles: true,
      diasUltimaAlerta: 3, ultimaEnHabiles: true,
    },
    {
      clave: 'OBLIGACION_LEGAL',
      descripcion: 'Calendario de obligaciones legales (5 días hábiles y 1 día antes)',
      diasPrimeraAlerta: 5, primeraEnHabiles: true,
      diasUltimaAlerta: 1, ultimaEnHabiles: false,
    },
  ]
  for (const r of reglas) {
    await prisma.reglaAlerta.upsert({
      where: { clave: r.clave },
      create: r,
      update: { descripcion: r.descripcion },
    })
  }
  console.log('Reglas de alerta listas (GLOBAL 10/3 hábiles, calendario legal 5h/1)')
}

async function main() {
  await seedRoles()
  await seedEmpresa()
  await seedCatalogos()
  await seedReglasAlerta()
  await seedNomina()
  await seedObligaciones()
  await seedMatrizLegal()
  await seedPlantillasContrato()
  await seedPlantillaLaboral()
  await seedPlantillaCuentaCobro()
  await seedAdmin()
}

main()
  .then(() => {
    console.log('Seed completado.')
    process.exit(0)
  })
  .catch((e) => {
    console.error('Error en seed:', e)
    process.exit(1)
  })
