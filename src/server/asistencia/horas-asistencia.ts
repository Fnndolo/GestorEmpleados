import 'server-only'
import { prisma } from '@/lib/db'
import { dividirDiurnoNocturno, PAREJA_TIPO_HORA } from '@/server/nomina/horas'
import {
  conexionAsistencia, tramosAsistencia, normalizarCedula, TIPO_HORA_DESDE_ASISTENCIA, type TramoAsistencia,
} from '@/server/asistencia/cliente'

/**
 * Horas con recargo provenientes del sistema de asistencia (AsistencIA).
 *
 * Reparto de responsabilidades (contrato en docs/integraciones/):
 *  - ASISTENCIA calcula QUÉ horas son extra: conoce el turno, la jornada
 *    pactada de cada empleado y el calendario. Aquí NO se recalcula nada.
 *  - ESTA PLATAFORMA decide cómo se clasifican (corte diurno/nocturno de las
 *    7 p.m., Ley 2466) y las liquida con su propio salario y factores.
 *
 * Se piden por HTTP con la clave de API de la empresa (ver cliente.ts). Al
 * liquidar (o recalcular) se piden de nuevo, así que corregir una marcación en
 * asistencia se refleja sola en el siguiente cálculo, sin copias que se
 * desactualicen. Sin clave, la plataforma liquida sin horas de marcaciones.
 */

export { urlPanelAsistencia } from '@/server/asistencia/cliente'

const iso = (d: Date) => d.toISOString().slice(0, 10)

/** ¿Está conectada AsistencIA para esta empresa? */
export async function asistenciaConfigurada(): Promise<boolean> {
  return (await conexionAsistencia()) !== null
}

export type NovedadDesdeTramo = {
  colaboradorId: string; fecha: Date; tipoHora: string; horas: number
  horaInicio: string; horaFin: string; referenciaExterna: string; observaciones: string
}

/**
 * Convierte los tramos de AsistencIA en filas de `NovedadHoras`, cruzando por
 * cédula y aplicando el corte diurno/nocturno de las 7 p.m. Un tramo que cruza
 * esa hora se parte en dos filas (diurna + nocturna) con la misma referencia.
 *
 * Devuelve también las cédulas que no están en esta plataforma (o están
 * retiradas): se reportan, no se descartan en silencio.
 */
export async function novedadesDesdeTramos(tramos: TramoAsistencia[]): Promise<{
  novedades: NovedadDesdeTramo[]
  sinColaborador: { documento: string; nombre: string | null }[]
}> {
  // Todas las fichas, comparadas por cédula normalizada: las de aquí pueden
  // traer puntos y las de allá no. Son pocas filas; cruzar en memoria es más
  // simple y seguro que adivinar el formato en la consulta.
  const colaboradores = tramos.length
    ? await prisma.colaborador.findMany({ select: { id: true, numeroDocumento: true, estado: true } })
    : []
  const porCedula = new Map(colaboradores.map((c) => [normalizarCedula(c.numeroDocumento), c]))

  const sinColaborador = new Map<string, string | null>()
  const novedades: NovedadDesdeTramo[] = []

  for (const t of tramos) {
    const cedula = normalizarCedula(t.documento)
    const colab = porCedula.get(cedula)
    if (!colab || colab.estado === 'RETIRADO') {
      if (!sinColaborador.has(cedula)) sinColaborador.set(cedula, t.nombre ?? null)
      continue
    }
    // Los dominicales/festivos llegan como HEDDF/HENDF; aquí son HEDD/HEND.
    const tipo = TIPO_HORA_DESDE_ASISTENCIA[t.tipoHora] ?? t.tipoHora
    const pareja = PAREJA_TIPO_HORA[tipo]
    if (!pareja) continue // código desconocido: se ignora, no se adivina
    // Corte diurno/nocturno de las 7 p.m. (Ley 2466): responsabilidad nuestra.
    const { diurnas, nocturnas } = dividirDiurnoNocturno(t.horaInicio, t.horaFin)
    const partes = [
      ...(diurnas > 0 && pareja.diurno ? [{ tipoHora: pareja.diurno, horas: diurnas }] : []),
      ...(nocturnas > 0 ? [{ tipoHora: pareja.nocturno, horas: nocturnas }] : []),
    ]
    for (const parte of partes) {
      novedades.push({
        colaboradorId: colab.id,
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
  return { novedades, sinColaborador: [...sinColaborador].map(([documento, nombre]) => ({ documento, nombre })) }
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
}): Promise<{
  generadas: number
  sinColaborador: string[]
  /** No se consultó el sistema de asistencia (no está conectado). */
  omitido?: boolean
  /** Horas ya registradas que se liquidan sin refrescar, al estar omitido. */
  sinRefrescar?: number
}> {
  if (!(await asistenciaConfigurada())) {
    // Sin conexión no se refrescan las horas, pero tampoco se pierden: el
    // borrado ocurre más abajo, después de traerlas, y aquí se sale antes. Las
    // que ya estén registradas se liquidan tal como están. Bloquear la nómina
    // por otro sistema sería peor que liquidar con las horas ya registradas.
    const sinRefrescar = await prisma.novedadHoras.count({
      where: { periodoId: periodo.id, referenciaExterna: { startsWith: 'arrive-' } },
    })
    return { generadas: 0, sinColaborador: [], omitido: true, sinRefrescar }
  }

  // Se piden ANTES de tocar la base: si falla, no se borró nada todavía.
  const tramos = await tramosAsistencia({ desde: iso(periodo.fechaInicio), hasta: iso(periodo.fechaFin) })
  const { novedades, sinColaborador } = await novedadesDesdeTramos(tramos)
  const datos = novedades.map((n) => ({ ...n, periodoId: periodo.id }))

  // Borrar y recrear en una transacción: nunca queda un periodo a medias. Un
  // tramo ya pagado en un periodo cerrado conserva su fila (índice único por
  // referencia + tipo): no se vuelve a pagar.
  await prisma.$transaction([
    prisma.novedadHoras.deleteMany({
      where: { periodoId: periodo.id, referenciaExterna: { startsWith: 'arrive-' } },
    }),
    ...(datos.length ? [prisma.novedadHoras.createMany({ data: datos, skipDuplicates: true })] : []),
  ])

  return { generadas: datos.length, sinColaborador: sinColaborador.map((s) => s.documento) }
}

/**
 * Sincroniza las horas de un rango FUERA de un periodo: lo que AsistencIA
 * reporta y aún nadie ha pagado queda registrado como novedad pendiente, para
 * verlo aquí antes de liquidar. Idempotente: lo que ya estaba se deja; lo que
 * AsistencIA ya no reporta (una marcación corregida) se quita, siempre que
 * ningún periodo lo haya recogido.
 */
export async function sincronizarHorasAsistencia(rango: { desde: string; hasta: string }): Promise<{
  creadas: number
  yaEstaban: number
  quitadas: number
  sinColaborador: { documento: string; nombre: string | null }[]
}> {
  const tramos = await tramosAsistencia(rango)
  const { novedades, sinColaborador } = await novedadesDesdeTramos(tramos)

  const referencias = new Set(novedades.map((n) => n.referenciaExterna))
  const sueltas = await prisma.novedadHoras.findMany({
    where: {
      periodoId: null,
      referenciaExterna: { startsWith: 'arrive-' },
      fecha: { gte: new Date(`${rango.desde}T00:00:00.000Z`), lte: new Date(`${rango.hasta}T00:00:00.000Z`) },
    },
    select: { id: true, referenciaExterna: true, tipoHora: true },
  })
  // Lo ya registrado, esté suelto o recogido por un periodo (incluso cerrado):
  // un tramo pagado no se vuelve a crear ni a contar como nuevo.
  const existentes = referencias.size
    ? await prisma.novedadHoras.findMany({
        where: { referenciaExterna: { in: [...referencias] } },
        select: { referenciaExterna: true, tipoHora: true },
      })
    : []
  const yaEstan = new Set(existentes.map((s) => `${s.referenciaExterna}|${s.tipoHora}`))
  const quitar = sueltas.filter((s) => !referencias.has(s.referenciaExterna!)).map((s) => s.id)
  const nuevas = novedades.filter((n) => !yaEstan.has(`${n.referenciaExterna}|${n.tipoHora}`))

  await prisma.$transaction([
    ...(quitar.length ? [prisma.novedadHoras.deleteMany({ where: { id: { in: quitar } } })] : []),
    ...(nuevas.length ? [prisma.novedadHoras.createMany({ data: nuevas, skipDuplicates: true })] : []),
  ])

  return { creadas: nuevas.length, yaEstaban: novedades.length - nuevas.length, quitadas: quitar.length, sinColaborador }
}
