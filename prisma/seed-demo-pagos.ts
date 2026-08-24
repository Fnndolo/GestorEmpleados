import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client.js'

/**
 * Datos de prueba para revisar a ojo las pantallas de cuentas de cobro OPS y de
 * préstamos de nómina, que en local estaban vacías.
 *
 * SOLO PARA DESARROLLO. Se niega a correr contra una base que no sea local, y
 * es idempotente: si ya sembró, no duplica.
 *
 *   pnpm exec tsx prisma/seed-demo-pagos.ts
 */

const url = process.env.DATABASE_URL ?? ''
if (!/localhost|127\.0\.0\.1/.test(url)) {
  console.error('Este seed es solo para la base local. DATABASE_URL apunta a otro servidor.')
  process.exit(1)
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })

/** Fecha de negocio (sin hora), como las guarda el sistema. */
const fecha = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

async function cuentasCobroOps() {
  const contrato = await prisma.contratoOps.findFirst({
    where: { estado: { in: ['ACTIVO', 'FIRMADO'] } },
    include: { colaborador: { select: { id: true, nombres: true, apellidos: true } } },
  })
  if (!contrato?.colaboradorId) {
    console.log('· Cuentas de cobro: no hay contrato OPS activo, se omite.')
    return
  }

  const yaHay = await prisma.cuentaCobroOps.count({ where: { colaboradorId: contrato.colaboradorId } })
  if (yaHay > 0) {
    console.log(`· Cuentas de cobro: ya existen ${yaHay}, se omite.`)
    return
  }

  const mensual = Number(contrato.valorMensual ?? 3_000_000)

  // Una por estado, para poder ver cómo se comporta la pantalla en cada caso.
  const cuentas = [
    { periodo: '2026-04', estado: 'PAGADA' as const, valor: mensual, concepto: 'Honorarios abril de 2026', radicacion: '2026-05-02', pago: '2026-05-08', ss: 'VALIDA' as const },
    { periodo: '2026-05', estado: 'PAGADA' as const, valor: mensual, concepto: 'Honorarios mayo de 2026', radicacion: '2026-06-02', pago: '2026-06-09', ss: 'VALIDA' as const },
    { periodo: '2026-06', estado: 'APROBADA' as const, valor: mensual, concepto: 'Honorarios junio de 2026', radicacion: '2026-07-01', pago: null, ss: 'VALIDA' as const },
    // Bloqueada: el soporte de seguridad social no cuadra. Es el caso que hay
    // que poder ver, porque sin PILA válida la cuenta no debe poder pagarse.
    { periodo: '2026-07', estado: 'BLOQUEADA_SS' as const, valor: mensual, concepto: 'Honorarios julio de 2026', radicacion: '2026-08-03', pago: null, ss: 'INVALIDA' as const },
    { periodo: '2026-08', estado: 'EN_VERIFICACION_SS' as const, valor: mensual, concepto: 'Honorarios agosto de 2026', radicacion: '2026-09-01', pago: null, ss: 'PENDIENTE' as const },
    // Radicada por el propio contratista desde su autoservicio, con un valor
    // distinto (mes incompleto): así se ve la diferencia con las que radica la empresa.
    { periodo: '2026-09', estado: 'RADICADA' as const, valor: Math.round(mensual * 0.6), concepto: 'Honorarios septiembre de 2026 (18 días)', radicacion: '2026-09-19', pago: null, ss: null },
  ]

  let n = 0
  for (const c of cuentas) {
    n += 1
    // Nace RADICADA a propósito: la base tiene un disparador que impide aprobar
    // o pagar sin soporte de seguridad social válido, así que primero se crea la
    // cuenta, luego su planilla, y solo entonces se le pone el estado final.
    const cuenta = await prisma.cuentaCobroOps.create({
      data: {
        colaboradorId: contrato.colaboradorId,
        contratoOpsId: contrato.id,
        numero: `CC-${n}`,
        periodo: c.periodo,
        concepto: c.concepto,
        valor: c.valor,
        fechaRadicacion: fecha(c.radicacion),
        estado: 'RADICADA',
        creadaPorContratista: c.periodo === '2026-09',
        observaciones: c.estado === 'BLOQUEADA_SS'
          ? 'El IBC declarado en la planilla no corresponde al 40% de los honorarios del periodo.'
          : null,
      },
    })
    if (c.ss) {
      await prisma.soporteSsOps.create({
        data: {
          cuentaCobroId: cuenta.id,
          operador: 'Aportes en Línea',
          periodoCotizado: c.periodo,
          // Base de cotización de un independiente: 40% de los honorarios.
          ibcDeclarado: c.ss === 'INVALIDA' ? Math.round(c.valor * 0.25) : Math.round(c.valor * 0.4),
          estadoVerificacion: c.ss,
          observaciones: c.ss === 'INVALIDA' ? 'IBC por debajo del 40% exigido.' : null,
        },
      })
    }
    if (c.estado !== 'RADICADA') {
      await prisma.cuentaCobroOps.update({
        where: { id: cuenta.id },
        data: { estado: c.estado, fechaPago: c.pago ? fecha(c.pago) : null },
      })
    }
  }
  console.log(`· Cuentas de cobro: ${cuentas.length} creadas para ${contrato.colaborador?.nombres} ${contrato.colaborador?.apellidos}.`)
}

async function prestamos() {
  const yaHay = await prisma.prestamo.count()
  if (yaHay > 0) {
    console.log(`· Préstamos: ya existen ${yaHay}, se omite.`)
    return
  }

  // Solo a quien tenga contrato laboral activo: es de donde se descuenta.
  const candidatos = await prisma.colaborador.findMany({
    where: { estado: 'ACTIVO', contratos: { some: { estado: 'ACTIVO' } } },
    select: { id: true, nombres: true, apellidos: true },
    take: 3,
  })
  if (candidatos.length === 0) {
    console.log('· Préstamos: nadie tiene contrato laboral activo, se omite.')
    return
  }

  const plantillas = [
    { valorTotal: 2_400_000, numeroCuotas: 12, pagadas: 5, fechaInicio: '2026-04-01', descripcion: 'Préstamo por calamidad doméstica' },
    { valorTotal: 1_200_000, numeroCuotas: 6, pagadas: 6, fechaInicio: '2026-02-01', descripcion: 'Adelanto de prima' },
    { valorTotal: 5_000_000, numeroCuotas: 20, pagadas: 2, fechaInicio: '2026-07-01', descripcion: 'Préstamo educativo' },
  ]

  for (const [i, colab] of candidatos.entries()) {
    const p = plantillas[i]
    const valorCuota = Math.round(p.valorTotal / p.numeroCuotas)
    // El saldo tiene que cuadrar con las cuotas marcadas como pagadas, o la
    // pantalla mostraría un préstamo que no suma.
    const saldo = p.valorTotal - valorCuota * p.pagadas
    const prestamo = await prisma.prestamo.create({
      data: {
        colaboradorId: colab.id,
        valorTotal: p.valorTotal,
        numeroCuotas: p.numeroCuotas,
        valorCuota,
        saldo,
        fechaInicio: fecha(p.fechaInicio),
        estado: p.pagadas >= p.numeroCuotas ? 'PAGADO' : 'ACTIVO',
        descripcion: p.descripcion,
      },
    })
    await prisma.cuotaPrestamo.createMany({
      data: Array.from({ length: p.numeroCuotas }, (_, k) => ({
        prestamoId: prestamo.id,
        numero: k + 1,
        valor: valorCuota,
        pagada: k < p.pagadas,
        fechaPago: k < p.pagadas ? fecha(mesSiguiente(p.fechaInicio, k)) : null,
      })),
    })
    console.log(`· Préstamo de ${p.descripcion} para ${colab.nombres} ${colab.apellidos}: ${p.pagadas}/${p.numeroCuotas} cuotas pagadas.`)
  }
}

/** Misma fecha corrida n meses, para las fechas de pago de cada cuota. */
function mesSiguiente(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`)
  d.setUTCMonth(d.getUTCMonth() + n)
  return d.toISOString().slice(0, 10)
}

async function main() {
  await cuentasCobroOps()
  await prestamos()
  console.log('Listo.')
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
