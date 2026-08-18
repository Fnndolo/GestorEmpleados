/**
 * Datos de demostración para validar reportes, filtros por sede/ciudad y alcances.
 * Crea una segunda sede (Medellín) y ~10 colaboradores de todos los vínculos con
 * contratos. Idempotente por documento. Uso: pnpm tsx prisma/seed-demo.ts
 */
import 'dotenv/config'
import { prisma } from '../src/lib/db'
import { normalizarTexto } from '../src/lib/texto'
import { seedEstructuraDemo } from './seed-catalogos'
import type { TipoVinculo, ModalidadTrabajo } from '../src/generated/prisma/enums'

const D = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))

const PERSONAS: {
  nombres: string; apellidos: string; doc: string; vinculo: TipoVinculo; modalidad: ModalidadTrabajo
  cargo: string; salario: number; sede: 'Bogotá' | 'Medellín'; ingreso: Date; fijoHasta?: Date
}[] = [
  { nombres: 'Carlos Andrés', apellidos: 'Gómez Ruiz', doc: '79123456', vinculo: 'TERMINO_INDEFINIDO', modalidad: 'PRESENCIAL', cargo: 'Gerente General', salario: 9_500_000, sede: 'Bogotá', ingreso: D(2019, 2, 1) },
  { nombres: 'Laura Catalina', apellidos: 'Martínez Peña', doc: '52234567', vinculo: 'TERMINO_INDEFINIDO', modalidad: 'HIBRIDO', cargo: 'Coordinador de Talento Humano', salario: 4_200_000, sede: 'Bogotá', ingreso: D(2021, 5, 15) },
  { nombres: 'Andrés Felipe', apellidos: 'Rojas Díaz', doc: '1015445566', vinculo: 'TERMINO_FIJO', modalidad: 'PRESENCIAL', cargo: 'Asesor Comercial', salario: 1_750_905, sede: 'Bogotá', ingreso: D(2025, 1, 10), fijoHasta: D(2026, 12, 31) },
  { nombres: 'Diana Marcela', apellidos: 'Hernández Soto', doc: '43223344', vinculo: 'TERMINO_INDEFINIDO', modalidad: 'PRESENCIAL', cargo: 'Auxiliar Contable', salario: 2_100_000, sede: 'Medellín', ingreso: D(2022, 8, 1) },
  { nombres: 'Juan Sebastián', apellidos: 'López Vargas', doc: '71445566', vinculo: 'TERMINO_FIJO', modalidad: 'PRESENCIAL', cargo: 'Técnico de Reparación', salario: 1_900_000, sede: 'Medellín', ingreso: D(2025, 3, 1), fijoHasta: D(2026, 9, 30) },
  { nombres: 'Valentina', apellidos: 'Castro Mejía', doc: '1037556677', vinculo: 'APRENDIZ_SENA', modalidad: 'PRESENCIAL', cargo: 'Asesor Comercial', salario: 1_300_000, sede: 'Bogotá', ingreso: D(2025, 7, 1) },
  { nombres: 'Mateo', apellidos: 'Ramírez Ortiz', doc: '80667788', vinculo: 'OBRA_LABOR', modalidad: 'PRESENCIAL', cargo: 'Auxiliar de Bodega', salario: 1_750_905, sede: 'Bogotá', ingreso: D(2025, 9, 1) },
  { nombres: 'Camila', apellidos: 'Torres Aguilar', doc: '53778899', vinculo: 'TERMINO_INDEFINIDO', modalidad: 'REMOTO', cargo: 'Líder Comercial', salario: 5_000_000, sede: 'Medellín', ingreso: D(2020, 11, 2) },
  { nombres: 'Felipe', apellidos: 'Naranjo Cárdenas', doc: '1020889900', vinculo: 'OPS', modalidad: 'REMOTO', cargo: 'Asesor Comercial', salario: 0, sede: 'Bogotá', ingreso: D(2026, 1, 15) },
  { nombres: 'Sofía', apellidos: 'Mendoza Quintero', doc: '1144990011', vinculo: 'PRACTICANTE', modalidad: 'HIBRIDO', cargo: 'Auxiliar de Talento Humano', salario: 1_400_000, sede: 'Bogotá', ingreso: D(2026, 2, 1) },
]

/**
 * Cuentas de acceso de prueba vinculadas a colaboradores demo.
 * Contraseña común; sin cambio forzado para facilitar las pruebas.
 * - Laura (Jefe de área) es jefe inmediato de Andrés → permite probar el flujo
 *   permiso: empleado → jefe inmediato → Talento Humano.
 * - Felipe (OPS) sirve para probar cuentas de cobro de autoservicio.
 */
const PASSWORD_DEMO = 'Empleado.2026*'
const USUARIOS_DEMO: { doc: string; email: string; nombre: string; rol: string }[] = [
  { doc: '52234567', email: 'laura.martinez@kupocell.test', nombre: 'Laura Martínez', rol: 'Jefe de área' },
  { doc: '1015445566', email: 'andres.rojas@kupocell.test', nombre: 'Andrés Rojas', rol: 'Empleado' },
  { doc: '1020889900', email: 'felipe.naranjo@kupocell.test', nombre: 'Felipe Naranjo', rol: 'Empleado' },
]

async function seedUsuariosDemo() {
  const { auth } = await import('../src/lib/auth')
  const idsPorDoc: Record<string, { colaboradorId: string }> = {}
  for (const u of USUARIOS_DEMO) {
    const rol = await prisma.rol.findUnique({ where: { nombre: u.rol } })
    const colab = await prisma.colaborador.findUnique({ where: { tipoDocumento_numeroDocumento: { tipoDocumento: 'CC', numeroDocumento: u.doc } } })
    if (!rol || !colab) continue
    let user = await prisma.user.findUnique({ where: { email: u.email } })
    if (!user) {
      const creado = await auth.api.createUser({
        body: { email: u.email, password: PASSWORD_DEMO, name: u.nombre, role: 'user', data: { rolId: rol.id, estado: 'ACTIVO', debeCambiarPassword: false } },
      })
      user = await prisma.user.findUnique({ where: { id: creado.user.id } })
    }
    await prisma.colaborador.update({ where: { id: colab.id }, data: { usuarioId: user!.id } })
    idsPorDoc[u.doc] = { colaboradorId: colab.id }
  }
  // Laura es jefe inmediato de Andrés (flujo de aprobación de permisos)
  if (idsPorDoc['52234567'] && idsPorDoc['1015445566']) {
    await prisma.colaborador.update({ where: { id: idsPorDoc['1015445566'].colaboradorId }, data: { jefeInmediatoId: idsPorDoc['52234567'].colaboradorId } })
  }
  console.log(`Usuarios demo listos (contraseña: ${PASSWORD_DEMO}): ${USUARIOS_DEMO.map((u) => u.email).join(', ')}`)
}

async function main() {
  // Áreas y cargos de ejemplo: el seed base ya NO los siembra (son propios de
  // cada empresa y se crean desde Configuración), pero el demo los necesita
  // para colgarle los colaboradores.
  await seedEstructuraDemo()

  // El demo crea sus propias ciudades/sedes (el seed de producción ya NO siembra
  // ninguna: producción arranca en blanco y el admin crea su sede real desde la app).
  const bogota = await prisma.ciudad.upsert({
    where: { nombre_departamento: { nombre: 'Bogotá', departamento: 'Cundinamarca' } },
    create: { nombre: 'Bogotá', departamento: 'Cundinamarca', codigoDane: '11001' },
    update: {},
  })
  const medellin = await prisma.ciudad.upsert({
    where: { nombre_departamento: { nombre: 'Medellín', departamento: 'Antioquia' } },
    create: { nombre: 'Medellín', departamento: 'Antioquia', codigoDane: '05001' },
    update: {},
  })
  const sedeBogota = await prisma.sede.upsert({
    where: { nombre: 'Sede Principal' },
    create: { nombre: 'Sede Principal', ciudadId: bogota.id, direccion: 'Por definir', esPrincipal: true },
    update: {},
  })
  const sedeMedellin = await prisma.sede.upsert({
    where: { nombre: 'Sede Medellín' },
    create: { nombre: 'Sede Medellín', ciudadId: medellin.id, direccion: 'Carrera 43A # 1-50', telefono: '6041234567' },
    update: {},
  })
  const sedeDe = (s: string) => (s === 'Medellín' ? sedeMedellin : sedeBogota)

  let creados = 0
  for (const p of PERSONAS) {
    const existe = await prisma.colaborador.findUnique({ where: { tipoDocumento_numeroDocumento: { tipoDocumento: 'CC', numeroDocumento: p.doc } } })
    if (existe) continue
    const cargo = await prisma.cargo.findFirst({ where: { nombre: p.cargo } })
    const sede = sedeDe(p.sede)
    const colab = await prisma.colaborador.create({
      data: {
        tipoDocumento: 'CC', numeroDocumento: p.doc, nombres: p.nombres, apellidos: p.apellidos,
        busquedaNormalizada: normalizarTexto(`${p.nombres} ${p.apellidos} ${p.doc}`),
        celular: '30012345' + p.doc.slice(-2), tipoVinculo: p.vinculo, modalidadTrabajo: p.modalidad,
        sedeId: sede.id, cargoId: cargo?.id ?? null, fechaIngreso: p.ingreso, estado: 'ACTIVO',
        ciudadResidenciaId: p.sede === 'Medellín' ? medellin.id : bogota.id, claseRiesgoArl: 'I',
      },
    })
    creados++

    // Contrato laboral (no para OPS)
    if (p.vinculo !== 'OPS') {
      const total = await prisma.contrato.count()
      const tipoContrato = p.vinculo === 'TERMINO_FIJO' ? 'TERMINO_FIJO' : p.vinculo === 'OBRA_LABOR' ? 'OBRA_LABOR' : p.vinculo === 'APRENDIZ_SENA' ? 'APRENDIZAJE_SENA' : p.vinculo === 'PRACTICANTE' ? 'PRACTICA' : 'TERMINO_INDEFINIDO'
      await prisma.contrato.create({
        data: {
          numero: `CT-DEMO-${String(total + 1).padStart(4, '0')}`, colaboradorId: colab.id, tipo: tipoContrato,
          cargoId: cargo?.id ?? null, sedeId: sede.id, modalidadTrabajo: p.modalidad, salarioBase: p.salario,
          tipoSalario: 'ORDINARIO', fechaInicio: p.ingreso, fechaFin: p.fijoHasta ?? null,
          objetoObraLabor: p.vinculo === 'OBRA_LABOR' ? 'Apoyo en bodega para temporada' : null,
          periodoPruebaDias: 60, estado: 'ACTIVO',
        },
      })
    } else {
      // Contrato OPS
      const total = await prisma.contratoOps.count()
      await prisma.contratoOps.create({
        data: {
          numero: `OPS-DEMO-${String(total + 1).padStart(4, '0')}`, colaboradorId: colab.id,
          objeto: 'Asesoría comercial externa para canales digitales', valorTotal: 18_000_000, valorMensual: 3_000_000,
          sedeId: sede.id, fechaInicio: p.ingreso, fechaFin: D(2026, 12, 31), rut: '900' + p.doc.slice(0, 6), estado: 'ACTIVO',
        },
      })
    }
  }
  console.log(`Datos demo: ${creados} colaborador(es) creado(s) en Bogotá y Medellín con sus contratos.`)
  await seedUsuariosDemo()
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
