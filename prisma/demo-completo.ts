import 'dotenv/config'
import { prisma } from '../src/lib/db'
import { liquidar } from '../src/server/nomina/motor'

/**
 * Datos DEMO completos para probar todo el sistema (RH + nómina).
 *
 *   npx tsx prisma/demo-completo.ts            → crea colaboradores con jefes,
 *      contratos, préstamos, vacaciones, ausencias, bonos, comisiones y horas
 *      extra + un periodo de nómina. Al final imprime un chequeo del motor.
 *   npx tsx prisma/demo-completo.ts --limpiar  → borra TODO lo anterior.
 *
 * No toca datos reales: todo va marcado con documento que empieza en "DEMO".
 */

const MARK = 'DEMO'
const hoy = new Date()
const Y = hoy.getUTCFullYear()
const M = hoy.getUTCMonth() + 1
const d = (mes: number, dia: number) => new Date(Date.UTC(Y, mes - 1, dia))

async function limpiar() {
  const demos = await prisma.colaborador.findMany({ where: { numeroDocumento: { startsWith: MARK } }, select: { id: true } })
  const ids = demos.map((x) => x.id)
  const periodos = await prisma.periodoNomina.findMany({ where: { nombre: { contains: '(DEMO)' } }, select: { id: true } })
  const pids = periodos.map((p) => p.id)
  if (ids.length === 0 && pids.length === 0) { console.log('No hay datos demo que limpiar.'); return }

  await prisma.liquidacionNomina.deleteMany({ where: { OR: [{ colaboradorId: { in: ids } }, { periodoId: { in: pids } }] } })
  await prisma.$transaction([
    prisma.novedadHoras.deleteMany({ where: { colaboradorId: { in: ids } } }),
    prisma.comision.deleteMany({ where: { colaboradorId: { in: ids } } }),
    prisma.bonificacion.deleteMany({ where: { colaboradorId: { in: ids } } }),
    prisma.prestamo.deleteMany({ where: { colaboradorId: { in: ids } } }),
    prisma.vacaciones.deleteMany({ where: { colaboradorId: { in: ids } } }),
    prisma.incapacidad.deleteMany({ where: { colaboradorId: { in: ids } } }),
    prisma.licencia.deleteMany({ where: { colaboradorId: { in: ids } } }),
    prisma.permiso.deleteMany({ where: { colaboradorId: { in: ids } } }),
    prisma.contrato.deleteMany({ where: { colaboradorId: { in: ids } } }),
    prisma.colaborador.updateMany({ where: { id: { in: ids } }, data: { jefeInmediatoId: null } }),
    prisma.colaborador.deleteMany({ where: { id: { in: ids } } }),
    prisma.periodoNomina.deleteMany({ where: { id: { in: pids } } }),
  ])
  console.log(`Datos demo eliminados (${ids.length} colaboradores, ${pids.length} periodos).`)
}

type SpecColab = {
  n: number; nombres: string; apellidos: string
  salario: number; minimo?: boolean; auxTransporte?: boolean; jefe?: number | null
}

async function sembrar() {
  const sede = await prisma.sede.findFirst()
  if (!sede) { console.error('No hay sedes. Corre primero: pnpm db:seed'); return }
  const cargo = await prisma.cargo.findFirst()
  const smmlv = await prisma.parametroLegal.findFirst({ where: { clave: 'SMMLV' }, orderBy: { vigenciaDesde: 'desc' } })
  if (!smmlv) { console.error('No hay parámetros de nómina. Corre: pnpm db:seed'); return }

  // Jerarquía: 1 gerente → 2 jefes → empleados
  const specs: SpecColab[] = [
    { n: 1, nombres: 'Laura', apellidos: 'Gerente Ríos', salario: 6_000_000, jefe: null },
    { n: 2, nombres: 'Carlos', apellidos: 'Jefe Muñoz', salario: 3_500_000, jefe: 1 },
    { n: 3, nombres: 'Ana', apellidos: 'Jefe Torres', salario: 3_500_000, jefe: 1 },
    { n: 4, nombres: 'Pedro', apellidos: 'Pérez Gómez', salario: 0, minimo: true, auxTransporte: true, jefe: 2 },
    { n: 5, nombres: 'María', apellidos: 'Díaz López', salario: 1_800_000, auxTransporte: true, jefe: 2 },
    { n: 6, nombres: 'Juan', apellidos: 'Ramírez Sol', salario: 2_400_000, jefe: 2 },
    { n: 7, nombres: 'Sofía', apellidos: 'Castro Vera', salario: 0, minimo: true, auxTransporte: true, jefe: 3 },
    { n: 8, nombres: 'Andrés', apellidos: 'Mora Ruiz', salario: 2_800_000, jefe: 3 },
    { n: 9, nombres: 'Valentina', apellidos: 'Niño Paz', salario: 2_100_000, auxTransporte: true, jefe: 3 },
    { n: 10, nombres: 'Diego', apellidos: 'Silva Cano', salario: 4_500_000, jefe: 1 },
  ]

  // Crear colaboradores (primero sin jefe para resolver el self-relation)
  const idPorN = new Map<number, string>()
  for (const s of specs) {
    const c = await prisma.colaborador.create({
      data: {
        tipoDocumento: 'CC', numeroDocumento: `${MARK}-${String(s.n).padStart(3, '0')}`,
        nombres: s.nombres, apellidos: s.apellidos, celular: `30000000${s.n}`,
        sedeId: sede.id, cargoId: cargo?.id ?? null, fechaIngreso: d(1, 1),
        tipoVinculo: 'TERMINO_INDEFINIDO', estado: 'ACTIVO', genero: 'OTRO', claseRiesgoArl: 'I',
      },
    })
    idPorN.set(s.n, c.id)
  }
  // Asignar jefes
  for (const s of specs) {
    if (s.jefe) await prisma.colaborador.update({ where: { id: idPorN.get(s.n)! }, data: { jefeInmediatoId: idPorN.get(s.jefe)! } })
  }

  // Contratos laborales activos (para que la nómina los liquide)
  for (const s of specs) {
    await prisma.contrato.create({
      data: {
        colaboradorId: idPorN.get(s.n)!, numero: `${MARK}-C-${s.n}`, tipo: 'TERMINO_INDEFINIDO',
        sedeId: sede.id, cargoId: cargo?.id ?? null, modalidadTrabajo: 'PRESENCIAL',
        salarioBase: s.minimo ? Number(smmlv.valor) : s.salario, tipoSalario: 'ORDINARIO',
        ganaSalarioMinimo: !!s.minimo, tieneAuxTransporte: !!s.auxTransporte,
        fechaInicio: d(1, 1), estado: 'ACTIVO',
      },
    })
  }

  const id = (n: number) => idPorN.get(n)!

  // ── Préstamos ──
  // Pedro (4): DOS préstamos activos → prueba el fix "sumar todas las cuotas".
  await prisma.prestamo.createMany({
    data: [
      { colaboradorId: id(4), valorTotal: 1_200_000, numeroCuotas: 12, valorCuota: 100_000, saldo: 900_000, fechaInicio: d(Math.max(1, M - 3), 1), estado: 'ACTIVO' },
      { colaboradorId: id(4), valorTotal: 600_000, numeroCuotas: 6, valorCuota: 100_000, saldo: 400_000, fechaInicio: d(Math.max(1, M - 2), 1), estado: 'ACTIVO' },
      { colaboradorId: id(6), valorTotal: 2_000_000, numeroCuotas: 10, valorCuota: 200_000, saldo: 1_400_000, fechaInicio: d(Math.max(1, M - 3), 1), estado: 'ACTIVO' },
    ],
  })

  // ── Vacaciones (aprobadas, en meses variados) ──
  await prisma.vacaciones.createMany({
    data: [
      { colaboradorId: id(5), fechaInicio: d(M, 10), fechaFin: d(M, 14), diasHabiles: 5, estado: 'APROBADA' },
      { colaboradorId: id(8), fechaInicio: d(Math.min(12, M + 1), 3), fechaFin: d(Math.min(12, M + 1), 7), diasHabiles: 5, estado: 'APROBADA' },
    ],
  })

  // ── Ausencias ──
  await prisma.incapacidad.create({ data: { colaboradorId: id(6), tipo: 'ENFERMEDAD_GENERAL', fechaInicio: d(M, 5), fechaFin: d(M, 7), dias: 3, entidad: 'EPS Demo' } })
  await prisma.licencia.create({ data: { colaboradorId: id(9), tipo: 'DIA_DE_LA_FAMILIA', fechaInicio: d(M, 15), fechaFin: d(M, 15), dias: 1 } })
  await prisma.permiso.create({ data: { colaboradorId: id(7), fecha: d(M, 20), diaCompleto: true, motivo: 'Cita médica', remunerado: true } })

  // ── Bonificaciones pendientes (prueba el fix de pago por periodo) ──
  await prisma.bonificacion.createMany({
    data: [
      { colaboradorId: id(6), concepto: 'Bono de productividad', valor: 300_000, constitutivoSalario: true, estadoPago: 'PENDIENTE' },
      { colaboradorId: id(8), concepto: 'Bono no constitutivo', valor: 200_000, constitutivoSalario: false, estadoPago: 'PENDIENTE' },
    ],
  })

  // ── Periodo de nómina del mes actual ──
  const finMes = new Date(Date.UTC(Y, M, 0)).getUTCDate()
  const periodo = await prisma.periodoNomina.create({
    data: {
      nombre: `${['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][M - 1]} ${Y} (DEMO)`,
      tipo: 'MENSUAL', anio: Y, mes: M, fechaInicio: d(M, 1), fechaFin: d(M, finMes), diasPeriodo: 30, estado: 'BORRADOR',
    },
  })

  // ── Comisiones y horas extra en ese periodo ──
  await prisma.comision.createMany({
    data: [
      { colaboradorId: id(4), periodoId: periodo.id, tipo: 'VENTA', baseCalculo: 10_000_000, valor: 500_000, descripcion: 'Comisión de ventas' },
      { colaboradorId: id(6), periodoId: periodo.id, tipo: 'RECAUDO', baseCalculo: 5_000_000, valor: 150_000, descripcion: 'Comisión de recaudo' },
    ],
  })
  await prisma.novedadHoras.createMany({
    data: [
      { colaboradorId: id(5), periodoId: periodo.id, fecha: d(M, 8), horaInicio: '18:00', horaFin: '20:00', tipoHora: 'HED', horas: 8 },
      { colaboradorId: id(9), periodoId: periodo.id, fecha: d(M, 9), horaInicio: '19:00', horaFin: '22:00', tipoHora: 'HEN', horas: 6 },
    ],
  })

  // ── Chequeo del motor (solo salario + auxilio, para sanidad de cifras) ──
  const params: Record<string, number> = {}
  const ps = await prisma.parametroLegal.findMany({ where: { vigenciaDesde: { lte: periodo.fechaFin }, OR: [{ vigenciaHasta: null }, { vigenciaHasta: { gte: periodo.fechaFin } }] }, orderBy: { vigenciaDesde: 'desc' } })
  for (const p of ps) if (!(p.clave in params)) params[p.clave] = Number(p.valor)

  console.log('\n✅ Demo creado. Chequeo del motor (salario base del mes, sin novedades):\n')
  console.log('  #  Colaborador             Salario     Devengado   Deducido      Neto')
  for (const s of specs) {
    const salarioBase = s.minimo ? Number(smmlv.valor) : s.salario
    const r = liquidar({
      salarioBase, tipoSalario: 'ORDINARIO', tieneAuxTransporte: !!s.auxTransporte, auxConectividad: 0,
      diasTrabajados: 30, diasPeriodo: 30, valorHorasExtra: 0, comisiones: 0,
      bonificacionConstitutiva: 0, bonificacionNoConstitutiva: 0, valorIncapacidad: 0, cuotaPrestamo: 0,
      claseRiesgoArl: 'I', empresaExonerada: true, aplicaRetefuente: false, parametros: params,
    })
    const fmt = (x: number) => x.toLocaleString('es-CO').padStart(11)
    console.log(`  ${String(s.n).padStart(2)} ${(s.nombres + ' ' + s.apellidos).padEnd(22)}${fmt(salarioBase)}${fmt(r.totalDevengado)}${fmt(r.totalDeducido)}${fmt(r.neto)}`)
  }
  console.log(`\n   Periodo de nómina creado: "${periodo.nombre}"`)
  console.log('   Ahora en la app: Nómina → ese periodo → Calcular, para probar el flujo completo')
  console.log('     (comisiones, horas extra, DOS préstamos de Pedro, bonos pendientes, ausencias).')
  console.log('   Deshacer todo:  npx tsx prisma/demo-completo.ts --limpiar')
}

const run = process.argv.includes('--limpiar') ? limpiar : sembrar
run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
