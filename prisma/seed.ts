/**
 * Seed inicial: roles del sistema + matriz de permisos, ciudades/sede principal,
 * configuración de empresa y usuario administrador.
 *
 * Idempotente: puede ejecutarse varias veces sin duplicar datos.
 * Uso: pnpm db:seed
 */
import 'dotenv/config'
import { prisma } from '../src/lib/db'
import { ROLES_SEED } from '../src/lib/permisos/modulos'
import { seedCatalogos } from './seed-catalogos'
import { seedNomina } from './seed-nomina'
import { seedObligaciones } from './seed-obligaciones'

// El admin inicial se configura por variables de entorno en producción.
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'michaelmartinez0996@gmail.com'
const ADMIN_PASSWORD_INICIAL = process.env.SEED_ADMIN_PASSWORD ?? 'Kupocell.2026*'
const ADMIN_NAME = process.env.SEED_ADMIN_NAME ?? 'Administrador'
// Por defecto el admin usa la contraseña indicada (sin cambio forzado). Pon
// SEED_ADMIN_FORCE_CHANGE=true para exigir el cambio en el primer ingreso.
const ADMIN_FORZAR_CAMBIO = process.env.SEED_ADMIN_FORCE_CHANGE === 'true'

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

async function seedSedes() {
  const bogota = await prisma.ciudad.upsert({
    where: { nombre_departamento: { nombre: 'Bogotá', departamento: 'Cundinamarca' } },
    create: { nombre: 'Bogotá', departamento: 'Cundinamarca', codigoDane: '11001' },
    update: {},
  })
  await prisma.ciudad.upsert({
    where: { nombre_departamento: { nombre: 'Medellín', departamento: 'Antioquia' } },
    create: { nombre: 'Medellín', departamento: 'Antioquia', codigoDane: '05001' },
    update: {},
  })
  await prisma.sede.upsert({
    where: { nombre: 'Sede Principal' },
    create: {
      nombre: 'Sede Principal',
      ciudadId: bogota.id,
      direccion: 'Por definir',
      esPrincipal: true,
    },
    update: {},
  })
  console.log('Ciudades y sede principal listas')
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
  console.log(`  Contraseña inicial configurada${ADMIN_FORZAR_CAMBIO ? ' (se exigirá cambiarla al primer ingreso)' : ''}.`)
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
  await seedSedes()
  await seedEmpresa()
  await seedCatalogos()
  await seedReglasAlerta()
  await seedNomina()
  await seedObligaciones()
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
