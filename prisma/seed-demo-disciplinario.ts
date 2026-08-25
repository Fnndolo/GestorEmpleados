import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client.js'

/**
 * Datos de prueba para recorrer el proceso disciplinario a ojo, que sin ellos
 * exige esperar cinco días hábiles para ver la segunda mitad del flujo.
 *
 * Deja dos procesos abiertos sobre colaboradores distintos:
 *  1. Con descargos ya presentados → listo para registrar la decisión.
 *  2. Con el plazo vencido y sin descargos → para probar la constancia que
 *     desatasca el proceso cuando el colaborador guarda silencio.
 *
 * SOLO PARA DESARROLLO: se niega a correr fuera de la base local, y no duplica.
 *
 *   pnpm exec tsx prisma/seed-demo-disciplinario.ts
 */
const url = process.env.DATABASE_URL ?? ''
if (!/localhost|127\.0\.0\.1/.test(url)) {
  console.error('Este seed es solo para la base local. DATABASE_URL apunta a otro servidor.')
  process.exit(1)
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })

/** Hoy a medianoche UTC, como guarda el sistema las fechas de negocio. */
function hoy(): Date {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}
function haceDias(n: number): Date {
  const d = hoy()
  d.setUTCDate(d.getUTCDate() - n)
  return d
}

async function buscar(nombres: string, apellidos: string) {
  return prisma.colaborador.findFirst({
    where: { nombres: { contains: nombres, mode: 'insensitive' }, apellidos: { contains: apellidos, mode: 'insensitive' } },
    select: { id: true, nombres: true, apellidos: true, usuarioId: true },
  })
}

async function notificar(usuarioId: string | null, titulo: string, mensaje: string, dedupe: string) {
  if (!usuarioId) return
  const ya = await prisma.notificacion.findFirst({ where: { dedupeKey: dedupe } })
  if (ya) return
  await prisma.notificacion.create({
    data: { userId: usuarioId, titulo, mensaje, enlace: '/autoservicio/disciplinarios', evento: 'disciplinario_citacion', dedupeKey: dedupe },
  })
}

async function main() {
  // ── 1. Proceso CON descargos presentados ────────────────────────────────
  const juan = await buscar('Juan', 'López')
  if (!juan) {
    console.log('· No se encontró a Juan Sebastián López Vargas; se omite.')
  } else if (await prisma.procesoDisciplinario.findFirst({ where: { colaboradorId: juan.id } })) {
    console.log('· Juan Sebastián ya tiene un proceso; se omite.')
  } else {
    const apertura = haceDias(6)
    const proceso = await prisma.procesoDisciplinario.create({
      data: {
        colaboradorId: juan.id,
        asunto: 'Incumplimiento de horario',
        descripcion: 'Llegadas tarde los días 12, 13 y 14, sin aviso previo al jefe inmediato.',
        etapa: 'DESCARGOS',
        fechaApertura: apertura,
        // Sin plazo: los descargos ya se presentaron, así que no hay reloj corriendo.
        fechaLimite: null,
      },
    })
    await prisma.etapaProceso.createMany({
      data: [
        { procesoId: proceso.id, etapa: 'CITACION_DESCARGOS', fecha: apertura, detalle: 'Apertura del proceso y citación a descargos' },
        {
          procesoId: proceso.id,
          etapa: 'DESCARGOS',
          fecha: haceDias(2),
          detalle: 'Descargos del colaborador: Reconozco las llegadas tarde. Fueron por el cierre de la vía en la salida al norte, que me tomó más de una hora los tres días. Ya cambié de ruta y salgo 40 minutos antes.',
        },
      ],
    })
    await notificar(
      juan.usuarioId,
      'Citación a descargos — proceso disciplinario',
      `${juan.nombres}, se abrió un proceso disciplinario por: "Incumplimiento de horario". Tienes derecho a presentar tus descargos dentro de los 5 días hábiles siguientes.`,
      `demo:disciplinario:citacion:${proceso.id}`,
    )
    console.log(`· ${juan.nombres} ${juan.apellidos}: proceso en DESCARGOS, listo para registrar la decisión.`)
  }

  // ── 1b. LLAMADO DE ATENCIÓN ya explicado por el colaborador ──────────────
  // Es el caso que muestra los dos botones del final: cerrarlo o escalarlo.
  if (!juan) {
    console.log('· No se encontró a Juan Sebastián; se omite el llamado de atención.')
  } else if (await prisma.procesoDisciplinario.findFirst({ where: { colaboradorId: juan.id, clase: 'LLAMADO_ATENCION' } })) {
    console.log('· Juan Sebastián ya tiene un llamado de atención; se omite.')
  } else {
    const apertura = haceDias(4)
    const llamado = await prisma.procesoDisciplinario.create({
      data: {
        colaboradorId: juan.id,
        clase: 'LLAMADO_ATENCION',
        asunto: 'Uso del celular en atención al cliente',
        descripcion: 'Se le observó atendiendo el celular mientras había clientes esperando en el mostrador.',
        etapa: 'DESCARGOS',
        fechaApertura: apertura,
        // Ya se explicó, así que no queda reloj corriendo.
        fechaLimite: null,
      },
    })
    await prisma.etapaProceso.createMany({
      data: [
        {
          procesoId: llamado.id,
          etapa: 'CITACION_DESCARGOS',
          fecha: apertura,
          detalle: 'Llamado de atención: se comunica al colaborador y se le da la oportunidad de explicarse',
        },
        {
          procesoId: llamado.id,
          etapa: 'DESCARGOS',
          fecha: haceDias(1),
          detalle: 'Descargos del colaborador: Era una llamada de la guardería de mi hija, que estaba enferma. Reconozco que debí avisarle a mi jefe y salir del mostrador; no volverá a pasar.',
        },
      ],
    })
    await notificar(
      juan.usuarioId,
      'Llamado de atención',
      `${juan.nombres}, se te hizo un llamado de atención por: "Uso del celular en atención al cliente". No es una sanción, pero si quieres explicar lo ocurrido tienes 5 días hábiles para hacerlo desde tu autoservicio.`,
      `demo:llamado:citacion:${llamado.id}`,
    )
    console.log(`· ${juan.nombres} ${juan.apellidos}: LLAMADO DE ATENCIÓN ya explicado, listo para cerrar o escalar.`)
  }

  // ── 2. Proceso con el plazo VENCIDO y sin descargos ──────────────────────
  const otro = await buscar('Mateo', 'Ramírez')
  if (!otro) {
    console.log('· No se encontró a Mateo Ramírez Ortiz; se omite el caso de plazo vencido.')
  } else if (await prisma.procesoDisciplinario.findFirst({ where: { colaboradorId: otro.id } })) {
    console.log('· Mateo ya tiene un proceso; se omite.')
  } else {
    const apertura = haceDias(20)
    const proceso = await prisma.procesoDisciplinario.create({
      data: {
        colaboradorId: otro.id,
        asunto: 'Uso indebido de bienes de la empresa',
        descripcion: 'Uso del vehículo asignado para diligencias personales en horario laboral.',
        etapa: 'CITACION_DESCARGOS',
        fechaApertura: apertura,
        // Vencido hace días: es lo que habilita la constancia de no comparecencia.
        fechaLimite: haceDias(8),
      },
    })
    await prisma.etapaProceso.create({
      data: { procesoId: proceso.id, etapa: 'CITACION_DESCARGOS', fecha: apertura, detalle: 'Apertura del proceso y citación a descargos' },
    })
    await notificar(
      otro.usuarioId,
      'Citación a descargos — proceso disciplinario',
      `${otro.nombres}, se abrió un proceso disciplinario por: "Uso indebido de bienes de la empresa". Tienes derecho a presentar tus descargos dentro de los 5 días hábiles siguientes.`,
      `demo:disciplinario:citacion:${proceso.id}`,
    )
    console.log(`· ${otro.nombres} ${otro.apellidos}: plazo vencido sin descargos, listo para dejar la constancia.`)
  }

  console.log('Listo.')
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
