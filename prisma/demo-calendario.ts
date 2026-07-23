import 'dotenv/config'
import { prisma } from '../src/lib/db'

/**
 * Datos DEMO para ver el calendario del colaborador poblado.
 *
 *   npx tsx prisma/demo-calendario.ts            → crea un colaborador "Demo Calendario"
 *                                                   con vacaciones, permisos, licencias,
 *                                                   incapacidad y fin de contrato del año actual.
 *   npx tsx prisma/demo-calendario.ts --limpiar  → elimina TODO lo anterior (reversible).
 *
 * No toca ningún empleado real: usa un colaborador dedicado (documento DEMO-CAL).
 */

const DOC = 'DEMO-CAL'
const Y = new Date().getUTCFullYear()
const d = (mes: number, dia: number) => new Date(Date.UTC(Y, mes - 1, dia))

async function limpiar() {
  const c = await prisma.colaborador.findFirst({ where: { numeroDocumento: DOC } })
  if (!c) {
    console.log('No hay datos demo que limpiar.')
    return
  }
  await prisma.$transaction([
    prisma.vacaciones.deleteMany({ where: { colaboradorId: c.id } }),
    prisma.permiso.deleteMany({ where: { colaboradorId: c.id } }),
    prisma.licencia.deleteMany({ where: { colaboradorId: c.id } }),
    prisma.incapacidad.deleteMany({ where: { colaboradorId: c.id } }),
    prisma.contrato.deleteMany({ where: { colaboradorId: c.id } }),
    prisma.colaborador.delete({ where: { id: c.id } }),
  ])
  console.log('Datos demo eliminados. El colaborador "Demo Calendario" y sus novedades ya no existen.')
}

async function sembrar() {
  const sede = await prisma.sede.findFirst()
  if (!sede) {
    console.error('No hay sedes. Corre primero: pnpm db:seed')
    return
  }
  const cargo = await prisma.cargo.findFirst()

  // Colaborador demo (idempotente por documento)
  let colab = await prisma.colaborador.findFirst({ where: { numeroDocumento: DOC } })
  if (!colab) {
    colab = await prisma.colaborador.create({
      data: {
        tipoDocumento: 'CC', numeroDocumento: DOC, nombres: 'Demo', apellidos: 'Calendario',
        celular: '3000000000', sedeId: sede.id, cargoId: cargo?.id ?? null,
        fechaIngreso: new Date(Date.UTC(Y - 2, 0, 15)), estado: 'ACTIVO',
        tipoVinculo: 'TERMINO_FIJO', genero: 'OTRO',
      },
    })
  }
  const colaboradorId = colab.id

  // Limpiar novedades previas del demo para no duplicar al re-ejecutar
  await prisma.$transaction([
    prisma.vacaciones.deleteMany({ where: { colaboradorId } }),
    prisma.permiso.deleteMany({ where: { colaboradorId } }),
    prisma.licencia.deleteMany({ where: { colaboradorId } }),
    prisma.incapacidad.deleteMany({ where: { colaboradorId } }),
    prisma.contrato.deleteMany({ where: { colaboradorId } }),
  ])

  await prisma.vacaciones.createMany({
    data: [
      { colaboradorId, fechaInicio: d(1, 6), fechaFin: d(1, 10), diasHabiles: 5, estado: 'APROBADA' },
      { colaboradorId, fechaInicio: d(12, 22), fechaFin: d(12, 26), diasHabiles: 5, estado: 'APROBADA' },
    ],
  })

  await prisma.permiso.createMany({
    data: [
      { colaboradorId, fecha: d(3, 12), diaCompleto: true, motivo: 'Cita médica', remunerado: true },
      { colaboradorId, fecha: d(6, 3), diaCompleto: false, horaInicio: '08:00', horaFin: '12:00', horas: 4, motivo: 'Diligencia personal', remunerado: true },
    ],
  })

  await prisma.licencia.createMany({
    data: [
      { colaboradorId, tipo: 'DIA_DE_LA_FAMILIA', fechaInicio: d(2, 14), fechaFin: d(2, 14), dias: 1 },
      { colaboradorId, tipo: 'ESTUDIO', fechaInicio: d(8, 20), fechaFin: d(8, 21), dias: 2 },
    ],
  })

  await prisma.incapacidad.create({
    data: { colaboradorId, tipo: 'ENFERMEDAD_GENERAL', fechaInicio: d(3, 18), fechaFin: d(3, 20), dias: 3, entidad: 'EPS Demo' },
  })

  await prisma.contrato.create({
    data: {
      colaboradorId, numero: `DEMO-${Y}`, tipo: 'TERMINO_FIJO', sedeId: sede.id, cargoId: cargo?.id ?? null,
      modalidadTrabajo: 'PRESENCIAL', salarioBase: 2_000_000, tipoSalario: 'ORDINARIO',
      fechaInicio: d(1, 1), fechaFin: d(6, 24), estado: 'ACTIVO',
    },
  })

  console.log('✅ Datos demo creados en el colaborador "Demo Calendario".')
  console.log(`   Abre:  /colaboradores/${colaboradorId}/calendario`)
  console.log('   Para deshacer:  npx tsx prisma/demo-calendario.ts --limpiar')
}

const run = process.argv.includes('--limpiar') ? limpiar : sembrar
run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
