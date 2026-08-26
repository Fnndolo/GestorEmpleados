import 'dotenv/config'
import { prisma } from '../src/lib/db'
import { normalizarTexto } from '../src/lib/texto'

/**
 * Escenario completo de la empresa para probar el sistema de punta a punta.
 *
 * Monta lo que el seed base deja fuera a propósito (áreas, cargos y personas son
 * de cada empresa) más una cuenta de acceso por CADA rol, para poder verificar
 * que cada quien ve y aprueba lo que le toca — y solo eso.
 *
 * Los sueldos son de salario mínimo, que es como se contrata en la práctica: es
 * donde aparecen las reglas que más se equivocan (auxilio de transporte, piso de
 * incapacidad, exoneración de aportes), y probar con sueldos altos las esconde.
 *
 * SOLO DESARROLLO: se niega a correr fuera de localhost. Idempotente.
 *
 *   pnpm exec tsx prisma/seed-escenario.ts
 */
const url = process.env.DATABASE_URL ?? ''
if (!/localhost|127\.0\.0\.1/.test(url)) {
  console.error('Este seed es solo para la base local.')
  process.exit(1)
}

const D = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))
const PASSWORD = 'Prueba.2026*'

/** Áreas de la empresa, con el cargo que las encabeza. */
const AREAS = [
  'Gerencia', 'Talento Humano', 'Comercial', 'Técnica', 'Contabilidad', 'SST', 'Jurídica',
]

const CARGOS: { nombre: string; area: string }[] = [
  { nombre: 'Gerente General', area: 'Gerencia' },
  { nombre: 'Coordinador de Talento Humano', area: 'Talento Humano' },
  { nombre: 'Asesor Comercial', area: 'Comercial' },
  { nombre: 'Líder Comercial', area: 'Comercial' },
  { nombre: 'Técnico de Reparación', area: 'Técnica' },
  { nombre: 'Auxiliar Contable', area: 'Contabilidad' },
  { nombre: 'Responsable de SST', area: 'SST' },
  { nombre: 'Abogado', area: 'Jurídica' },
]

/**
 * Personas del escenario. `rol` es la cuenta de acceso que se le crea; `jefe` es
 * el documento de su jefe inmediato, que decide a quién le llega la aprobación.
 */
type Persona = {
  nombres: string; apellidos: string; doc: string
  vinculo: 'TERMINO_INDEFINIDO' | 'TERMINO_FIJO' | 'OBRA_LABOR' | 'APRENDIZ_SENA' | 'OPS'
  cargo: string; area: string; salario: number
  ingreso: Date; fijoHasta?: Date
  rol: string; jefe?: string
}

const MINIMO = 1_750_905

const PERSONAS: Persona[] = [
  {
    nombres: 'Ricardo', apellidos: 'Peña Solarte', doc: '10100001',
    vinculo: 'TERMINO_INDEFINIDO', cargo: 'Gerente General', area: 'Gerencia',
    salario: 8_000_000, ingreso: D(2018, 3, 1), rol: 'Administrador',
  },
  {
    nombres: 'Mónica', apellidos: 'Bastidas Erazo', doc: '10100002',
    vinculo: 'TERMINO_INDEFINIDO', cargo: 'Coordinador de Talento Humano', area: 'Talento Humano',
    salario: 2_800_000, ingreso: D(2021, 6, 1), rol: 'Recursos Humanos', jefe: '10100001',
  },
  {
    nombres: 'Gloria', apellidos: 'Muñoz Rosero', doc: '10100003',
    vinculo: 'TERMINO_INDEFINIDO', cargo: 'Auxiliar Contable', area: 'Contabilidad',
    salario: 2_200_000, ingreso: D(2022, 2, 1), rol: 'Contador', jefe: '10100001',
  },
  {
    nombres: 'Hernán', apellidos: 'Chávez Ortega', doc: '10100004',
    vinculo: 'TERMINO_INDEFINIDO', cargo: 'Responsable de SST', area: 'SST',
    salario: 2_400_000, ingreso: D(2023, 1, 16), rol: 'Responsable SST', jefe: '10100001',
  },
  {
    nombres: 'Paula', apellidos: 'Jiménez Burbano', doc: '10100005',
    vinculo: 'TERMINO_INDEFINIDO', cargo: 'Abogado', area: 'Jurídica',
    salario: 3_000_000, ingreso: D(2023, 8, 1), rol: 'Jurídica', jefe: '10100001',
  },
  {
    nombres: 'Diego', apellidos: 'Benavides Lasso', doc: '10100006',
    vinculo: 'TERMINO_INDEFINIDO', cargo: 'Líder Comercial', area: 'Comercial',
    salario: 2_600_000, ingreso: D(2020, 9, 1), rol: 'Jefe de área', jefe: '10100001',
  },
  // ── Los que hacen el trabajo: salario mínimo, que es el caso real ──
  {
    nombres: 'Yeison', apellidos: 'Córdoba Palacios', doc: '10100007',
    vinculo: 'TERMINO_INDEFINIDO', cargo: 'Asesor Comercial', area: 'Comercial',
    salario: MINIMO, ingreso: D(2024, 4, 1), rol: 'Empleado', jefe: '10100006',
  },
  {
    nombres: 'Leidy', apellidos: 'Chamorro Rivera', doc: '10100008',
    vinculo: 'TERMINO_FIJO', cargo: 'Asesor Comercial', area: 'Comercial',
    salario: MINIMO, ingreso: D(2026, 1, 15), fijoHasta: D(2026, 12, 31),
    rol: 'Empleado', jefe: '10100006',
  },
  {
    nombres: 'Wilson', apellidos: 'Guerrero Insuasty', doc: '10100009',
    vinculo: 'OBRA_LABOR', cargo: 'Técnico de Reparación', area: 'Técnica',
    salario: MINIMO, ingreso: D(2025, 11, 3), rol: 'Empleado', jefe: '10100006',
  },
  {
    nombres: 'Tatiana', apellidos: 'Portilla Enríquez', doc: '10100010',
    vinculo: 'APRENDIZ_SENA', cargo: 'Asesor Comercial', area: 'Comercial',
    salario: MINIMO, ingreso: D(2026, 2, 2), rol: 'Empleado', jefe: '10100006',
  },
  // ── Contratista: sin salario, cobra por cuenta de cobro ──
  {
    nombres: 'Óscar', apellidos: 'Delgado Zambrano', doc: '10100011',
    vinculo: 'OPS', cargo: 'Técnico de Reparación', area: 'Técnica',
    salario: 0, ingreso: D(2026, 3, 2), rol: 'Empleado',
  },
]

async function catalogos(sedeId: string) {
  const areas = new Map<string, string>()
  for (const nombre of AREAS) {
    const a = (await prisma.area.findFirst({ where: { nombre } }))
      ?? (await prisma.area.create({ data: { nombre, activa: true } }))
    areas.set(nombre, a.id)
  }
  const cargos = new Map<string, string>()
  for (const c of CARGOS) {
    const areaId = areas.get(c.area)!
    const existente = await prisma.cargo.findFirst({ where: { nombre: c.nombre, areaId } })
    const cargo = existente ?? (await prisma.cargo.create({ data: { nombre: c.nombre, areaId, activo: true } }))
    cargos.set(c.nombre, cargo.id)
  }
  console.log(`· Catálogos: ${areas.size} áreas, ${cargos.size} cargos (sede ${sedeId.slice(0, 8)}…)`)
  return { areas, cargos }
}

async function main() {
  const sede = await prisma.sede.findFirst({ where: { activa: true } })
  if (!sede) {
    console.error('No hay sedes. Corre primero `pnpm db:seed`.')
    process.exit(1)
  }
  const { areas, cargos } = await catalogos(sede.id)

  // ── Colaboradores ──
  const porDoc = new Map<string, string>()
  for (const p of PERSONAS) {
    const ya = await prisma.colaborador.findUnique({
      where: { tipoDocumento_numeroDocumento: { tipoDocumento: 'CC', numeroDocumento: p.doc } },
    })
    const datos = {
      nombres: p.nombres, apellidos: p.apellidos,
      tipoDocumento: 'CC' as const, numeroDocumento: p.doc,
      celular: '3000000000',
      emailPersonal: `${normalizarTexto(p.nombres).split(' ')[0]}.${normalizarTexto(p.apellidos).split(' ')[0]}@prueba.local`,
      sedeId: sede.id, areaId: areas.get(p.area)!, cargoId: cargos.get(p.cargo)!,
      tipoVinculo: p.vinculo, modalidadTrabajo: 'PRESENCIAL' as const,
      fechaIngreso: p.ingreso, estado: 'ACTIVO' as const,
      busquedaNormalizada: normalizarTexto(`${p.nombres} ${p.apellidos} ${p.doc}`),
    }
    const colab = ya
      ? await prisma.colaborador.update({ where: { id: ya.id }, data: datos })
      : await prisma.colaborador.create({ data: datos })
    porDoc.set(p.doc, colab.id)
  }

  // Jefes inmediatos: se hace en una segunda pasada porque un jefe puede
  // aparecer después que su subalterno en la lista.
  for (const p of PERSONAS) {
    if (!p.jefe) continue
    await prisma.colaborador.update({
      where: { id: porDoc.get(p.doc)! },
      data: { jefeInmediatoId: porDoc.get(p.jefe)! },
    })
  }
  console.log(`· Colaboradores: ${PERSONAS.length} (${PERSONAS.filter((p) => p.salario === MINIMO).length} con salario mínimo)`)

  // ── Contratos ──
  let contratos = 0
  for (const p of PERSONAS) {
    const colaboradorId = porDoc.get(p.doc)!
    if (p.vinculo === 'OPS') {
      const ya = await prisma.contratoOps.findFirst({ where: { colaboradorId } })
      if (ya) continue
      await prisma.contratoOps.create({
        data: {
          numero: `OPS-PRUEBA-${p.doc.slice(-4)}`, colaboradorId, sedeId: sede.id,
          objeto: 'Reparación de equipos por demanda',
          valorTotal: 12_000_000, valorMensual: 2_000_000,
          fechaInicio: p.ingreso, fechaFin: D(2026, 12, 31),
          estado: 'ACTIVO',
        },
      })
      contratos++
      continue
    }
    const ya = await prisma.contrato.findFirst({ where: { colaboradorId } })
    if (ya) continue
    await prisma.contrato.create({
      data: {
        numero: `CT-PRUEBA-${p.doc.slice(-4)}`, colaboradorId, sedeId: sede.id,
        cargoId: cargos.get(p.cargo)!,
        tipo: p.vinculo === 'APRENDIZ_SENA' ? 'APRENDIZAJE_SENA' : p.vinculo,
        jornada: 'TIEMPO_COMPLETO', modalidadTrabajo: 'PRESENCIAL', tipoSalario: 'ORDINARIO',
        salarioBase: p.salario, ganaSalarioMinimo: p.salario === MINIMO,
        // Hasta 2 SMMLV lleva auxilio de transporte (Ley 15 de 1959).
        tieneAuxTransporte: p.salario > 0 && p.salario <= MINIMO * 2,
        fechaInicio: p.ingreso, fechaFin: p.fijoHasta ?? null,
        objetoObraLabor: p.vinculo === 'OBRA_LABOR' ? 'Reparación de equipos del lote de garantías' : null,
        estado: 'ACTIVO', origenPdf: 'SUBIDO',
      },
    })
    contratos++
  }
  console.log(`· Contratos: ${contratos} creados`)

  // ── Cuentas de acceso, una por rol ──
  const { auth } = await import('../src/lib/auth')
  const creadas: string[] = []
  for (const p of PERSONAS) {
    const rol = await prisma.rol.findUnique({ where: { nombre: p.rol } })
    if (!rol) { console.log(`  ! No existe el rol "${p.rol}"; se omite ${p.nombres}`); continue }
    const email = `${normalizarTexto(p.nombres).split(' ')[0]}.${normalizarTexto(p.apellidos).split(' ')[0]}@prueba.local`
    let user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      const creado = await auth.api.createUser({
        body: {
          email, password: PASSWORD, name: `${p.nombres} ${p.apellidos}`, role: 'user',
          data: { rolId: rol.id, estado: 'ACTIVO', debeCambiarPassword: false },
        },
      })
      user = await prisma.user.findUnique({ where: { id: creado.user.id } })
      creadas.push(`${email} (${p.rol})`)
    }
    await prisma.colaborador.update({ where: { id: porDoc.get(p.doc)! }, data: { usuarioId: user!.id } })
  }

  console.log(`· Cuentas nuevas: ${creadas.length}`)
  for (const c of creadas) console.log(`    ${c}`)
  console.log(`\nContraseña de todas: ${PASSWORD}`)
  console.log('Listo.')
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
