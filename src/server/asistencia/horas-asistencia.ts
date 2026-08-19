import 'server-only'
import { prisma } from '@/lib/db'
import { dividirDiurnoNocturno, PAREJA_TIPO_HORA } from '@/server/nomina/horas'

/**
 * Horas con recargo provenientes del sistema de asistencia (ArriveControl).
 *
 * Reparto de responsabilidades (contrato en docs/integraciones/):
 *  - ASISTENCIA calcula QUÉ horas son extra: conoce el turno, la jornada
 *    pactada de cada empleado y el calendario. Aquí NO se recalcula nada.
 *  - ESTA PLATAFORMA decide cómo se clasifican (corte diurno/nocturno de las
 *    7 p.m., Ley 2466) y las liquida.
 *
 * Se piden por HTTP, no leyendo su base de datos: son dos sistemas separados
 * y cada uno es dueño de sus tablas. Al liquidar (o recalcular) se piden de
 * nuevo, así que corregir una marcación en asistencia se refleja sola en el
 * siguiente cálculo, sin copias que se desactualicen.
 *
 * Si `ARRIVECONTROL_URL` no está configurada, esta plataforma asume que el
 * cliente no tiene el módulo de asistencia y liquida sin horas de marcaciones.
 */

type TramoAsistencia = {
  documento: string
  fecha: string // YYYY-MM-DD (día Bogotá)
  horaInicio: string // HH:MM
  horaFin: string // HH:MM
  tipoHora: string // HED | HEDD | …
  horas: number
  referenciaExterna: string
  observaciones?: string
}

const iso = (d: Date) => d.toISOString().slice(0, 10)

/** ¿Está configurado el módulo de asistencia para este cliente? */
export function asistenciaConfigurada(): boolean {
  return Boolean(process.env.ARRIVECONTROL_URL)
}

/**
 * Enlace al panel de ArriveControl para revisar las marcaciones a mano.
 *
 * Sale del MISMO `ARRIVECONTROL_URL` que usa la API: antes había una segunda
 * variable (`ASISTENCIA_URL`) con el enlace completo escrito aparte, así que
 * mudarse de dominio obligaba a acordarse de las dos y podían quedar apuntando
 * a servidores distintos sin que nadie lo notara.
 */
export function urlPanelAsistencia(): string | null {
  const base = process.env.ARRIVECONTROL_URL?.replace(/\/+$/, '')
  return base ? `${base}/admin?tab=equipo` : null
}

/**
 * Pide a ArriveControl los tramos de un rango. Lanza si está configurado pero
 * no responde: preferimos que la liquidación falle a producir una nómina sin
 * las horas extra de la gente.
 */
async function pedirTramos(desdeISO: string, hastaISO: string): Promise<TramoAsistencia[]> {
  const base = process.env.ARRIVECONTROL_URL!.replace(/\/$/, '')
  const url = `${base}/api/horas?desde=${desdeISO}&hasta=${hastaISO}`
  const clave = process.env.ARRIVECONTROL_API_KEY ?? process.env.INTEGRACION_HORAS_API_KEY ?? ''

  let res: Response
  try {
    res = await fetch(url, { headers: { 'X-API-Key': clave }, cache: 'no-store' })
  } catch (e) {
    throw new Error(
      `No se pudo consultar las horas en el sistema de asistencia (${base}). ` +
        `Verifica que esté disponible e inténtalo de nuevo. Detalle: ${String(e)}`,
    )
  }

  const texto = await res.text()
  let datos: { ok?: boolean; error?: string; registros?: TramoAsistencia[] } | null = null
  try {
    datos = JSON.parse(texto)
  } catch {
    throw new Error(`El sistema de asistencia respondió ${res.status} con algo que no es JSON.`)
  }
  if (!res.ok || !datos?.ok) {
    throw new Error(`El sistema de asistencia rechazó la consulta (${res.status}): ${datos?.error ?? 'sin detalle'}`)
  }
  return datos.registros ?? []
}

/**
 * Regenera las novedades de horas de ORIGEN ASISTENCIA de un periodo abierto:
 * borra las `arrive-…` del periodo y las recrea con lo que reporte el sistema
 * de asistencia, aplicando el corte diurno/nocturno de las 7 p.m.
 * @returns resumen para mostrar en la UI de liquidación.
 */
export async function regenerarNovedadesAsistencia(periodo: {
  id: string
  fechaInicio: Date
  fechaFin: Date
}): Promise<{ generadas: number; sinColaborador: string[]; omitido?: boolean }> {
  if (!asistenciaConfigurada()) {
    // Red de seguridad: si el periodo YA tiene horas de asistencia, este
    // cliente sí usa el módulo y falta configuración. Liquidar así borraría
    // sus horas extra en silencio, así que se detiene con un aviso claro.
    const yaTiene = await prisma.novedadHoras.count({
      where: { periodoId: periodo.id, referenciaExterna: { startsWith: 'arrive-' } },
    })
    if (yaTiene > 0) {
      throw new Error(
        'Este periodo tiene horas provenientes del sistema de asistencia, pero ARRIVECONTROL_URL no está configurada. ' +
          'Configúrala antes de liquidar para no perder las horas extra.',
      )
    }
    return { generadas: 0, sinColaborador: [], omitido: true }
  }

  // Se piden ANTES de tocar la base: si falla, no se borró nada todavía.
  const tramos = await pedirTramos(iso(periodo.fechaInicio), iso(periodo.fechaFin))

  // Colaboradores por cédula (una sola consulta).
  const cedulas = [...new Set(tramos.map((t) => t.documento))]
  const colaboradores = cedulas.length
    ? await prisma.colaborador.findMany({
        where: { numeroDocumento: { in: cedulas } },
        select: { id: true, numeroDocumento: true, estado: true },
      })
    : []
  const porCedula = new Map(colaboradores.map((c) => [c.numeroDocumento, c]))

  const sinColaborador: string[] = []
  const datos: {
    colaboradorId: string; periodoId: string; fecha: Date; tipoHora: string; horas: number
    horaInicio: string; horaFin: string; referenciaExterna: string; observaciones: string
  }[] = []

  for (const t of tramos) {
    const colab = porCedula.get(t.documento)
    if (!colab || colab.estado === 'RETIRADO') {
      if (!sinColaborador.includes(t.documento)) sinColaborador.push(t.documento)
      continue
    }
    // Corte diurno/nocturno de las 7 p.m. (Ley 2466): responsabilidad nuestra.
    const { diurnas, nocturnas } = dividirDiurnoNocturno(t.horaInicio, t.horaFin)
    const pareja = PAREJA_TIPO_HORA[t.tipoHora]
    if (!pareja) continue // código de hora desconocido: se ignora, no se adivina
    const partes = [
      ...(diurnas > 0 && pareja.diurno ? [{ tipoHora: pareja.diurno, horas: diurnas }] : []),
      ...(nocturnas > 0 ? [{ tipoHora: pareja.nocturno, horas: nocturnas }] : []),
    ]
    for (const parte of partes) {
      datos.push({
        colaboradorId: colab.id,
        periodoId: periodo.id,
        fecha: new Date(`${t.fecha}T00:00:00.000Z`),
        tipoHora: parte.tipoHora,
        horas: parte.horas,
        horaInicio: t.horaInicio,
        horaFin: t.horaFin,
        referenciaExterna: t.referenciaExterna,
        observaciones: t.observaciones ?? 'Calculada de las marcaciones de asistencia.',
      })
    }
  }

  // Borrar y recrear en una transacción: nunca queda un periodo a medias.
  await prisma.$transaction([
    prisma.novedadHoras.deleteMany({
      where: { periodoId: periodo.id, referenciaExterna: { startsWith: 'arrive-' } },
    }),
    ...(datos.length ? [prisma.novedadHoras.createMany({ data: datos, skipDuplicates: true })] : []),
  ])

  return { generadas: datos.length, sinColaborador }
}
