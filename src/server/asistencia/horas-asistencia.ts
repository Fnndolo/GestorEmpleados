import 'server-only'
import { prisma } from '@/lib/db'
import { dividirDiurnoNocturno, PAREJA_TIPO_HORA, JORNADA_VIGENCIAS } from '@/server/nomina/horas'
import { cargarFestivos } from '@/server/vencimientos/festivos'

/**
 * Horas con recargo DERIVADAS de las marcaciones de asistencia (esquema
 * `asistencia`, misma base de datos — las escribe ArriveControl al instante).
 *
 * Modelo: NADIE envía nada. Al liquidar/recalcular un periodo, este módulo
 * borra las novedades de origen asistencia del periodo y las regenera leyendo
 * las marcaciones actuales. Editar una marcación y recalcular SIEMPRE cuadra;
 * no existen copias que se desactualicen. Los periodos cerrados no se tocan
 * (liquidarPeriodo ya lo impide antes de llamar aquí).
 *
 * Reglas (espejo de ArriveControl, congeladas hasta el RIT):
 *  - Jornada por DÍA: la pactada del empleado (jornada_semanal[lun..sáb]) o la
 *    legal vigente (Ley 2101, semanal/6). La extra del día es lo que exceda,
 *    atribuida a las últimas horas trabajadas.
 *  - Domingo/festivo: todo lo trabajado es extra dominical (HEDD).
 *  - El corte diurno/nocturno (7 p.m., Ley 2466) se aplica aquí con
 *    dividirDiurnoNocturno, igual que hacía la integración por API.
 *  - Tramos < 0.5 h se descartan (regla del contrato, pendiente con KUPOCELL).
 */

type Marca = {
  empleado_id: string
  cedula: string | null
  jornada_semanal: number[] | null
  tipo: 'entrada' | 'salida'
  fecha: string // YYYY-MM-DD día Bogotá
  minutos: number // minuto del día Bogotá
  epoch: number
  dow: number // 0=dom … 6=sáb
}

const round1 = (n: number) => Math.round(n * 10) / 10
const hhmm = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440 // normaliza cruces de medianoche
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

const horasDiaLegal = (fechaISO: string): number => {
  const v = JORNADA_VIGENCIAS.find((x) => fechaISO >= x.desde) ?? JORNADA_VIGENCIAS[JORNADA_VIGENCIAS.length - 1]
  return v.horasSemana / 6
}

type Tramo = {
  cedula: string
  fecha: string
  horaInicio: string
  horaFin: string
  tipoHora: 'HED' | 'HEDD'
  horas: number
  referenciaExterna: string
}

/** Calcula los tramos de horas con recargo de un rango de fechas (días Bogotá). */
export async function calcularTramosAsistencia(desdeISO: string, hastaISO: string): Promise<Tramo[]> {
  const festivos = await cargarFestivos(Number(desdeISO.slice(0, 4)), Number(hastaISO.slice(0, 4)))

  const rows = await prisma.$queryRaw<Marca[]>`
    select m.empleado_id, e.cedula, e.jornada_semanal, m.tipo,
           to_char(m.ts at time zone 'America/Bogota', 'YYYY-MM-DD') as fecha,
           (extract(hour from m.ts at time zone 'America/Bogota') * 60
            + extract(minute from m.ts at time zone 'America/Bogota'))::int as minutos,
           extract(epoch from m.ts)::float8 as epoch,
           extract(dow from m.ts at time zone 'America/Bogota')::int as dow
      from asistencia.marcaciones m
      join asistencia.empleados e on e.id = m.empleado_id
     where not m.eliminada
       and (m.ts at time zone 'America/Bogota')::date >= ${desdeISO}::date
       and (m.ts at time zone 'America/Bogota')::date <= ${hastaISO}::date
     order by m.empleado_id, m.ts`

  // Agrupar por empleado y armar pares entrada→salida (entrada sin cerrar no suma).
  const porEmpleado = new Map<string, { cedula: string | null; jornada: number[] | null; marcas: Marca[] }>()
  for (const r of rows) {
    if (!porEmpleado.has(r.empleado_id)) {
      porEmpleado.set(r.empleado_id, { cedula: r.cedula, jornada: r.jornada_semanal, marcas: [] })
    }
    porEmpleado.get(r.empleado_id)!.marcas.push(r)
  }

  const tramos: Tramo[] = []
  for (const e of porEmpleado.values()) {
    if (!e.cedula) continue // sin cédula no hay a quién abonarle las horas

    type Par = { fecha: string; desde: number; hastaAbs: number; horas: number; dow: number; dominical: boolean }
    const pares: Par[] = []
    let abierta: Marca | null = null
    for (const m of e.marcas) {
      if (m.tipo === 'entrada') abierta = m
      else if (m.tipo === 'salida' && abierta) {
        const horas = (m.epoch - abierta.epoch) / 3600
        pares.push({
          fecha: abierta.fecha, // el turno pertenece al día en que ENTRÓ
          desde: abierta.minutos,
          // Fin en minutos ABSOLUTOS desde las 0:00 del día de entrada: un
          // turno 22:00→02:00 termina en el minuto 1560, no en el 120. Así la
          // resta de la extra nunca produce horas negativas.
          hastaAbs: abierta.minutos + Math.round(horas * 60),
          horas,
          dow: abierta.dow,
          dominical: abierta.dow === 0 || festivos.has(abierta.fecha),
        })
        abierta = null
      }
    }

    const porDia = new Map<string, Par[]>()
    for (const p of pares) {
      if (!porDia.has(p.fecha)) porDia.set(p.fecha, [])
      porDia.get(p.fecha)!.push(p)
    }

    for (const [fecha, ps] of porDia) {
      const empujar = (desdeMin: number, hastaMin: number, horas: number, tipoHora: 'HED' | 'HEDD') => {
        if (horas < 0.5) return // mínimo del contrato
        const hi = hhmm(desdeMin)
        const hf = hhmm(hastaMin)
        tramos.push({
          cedula: e.cedula!, fecha, horaInicio: hi, horaFin: hf,
          horas: round1(horas), tipoHora,
          referenciaExterna: `arrive-${e.cedula}-${fecha.replaceAll('-', '')}-${hi.replace(':', '')}-${hf.replace(':', '')}-${tipoHora}`,
        })
      }

      if (ps[0].dominical) {
        // Domingo/festivo: no es día de jornada → todo el día es HEDD.
        for (const p of ps) empujar(p.desde, p.hastaAbs, p.horas, 'HEDD')
        continue
      }

      const jornadaDia = ps[0].dow >= 1 && ps[0].dow <= 6
        ? (e.jornada?.[ps[0].dow - 1] ?? horasDiaLegal(fecha))
        : horasDiaLegal(fecha)
      const horasDia = ps.reduce((s, p) => s + p.horas, 0)
      let restante = Math.max(0, horasDia - jornadaDia)
      for (let i = ps.length - 1; i >= 0 && restante > 0.001; i--) {
        const p = ps[i]
        const toma = Math.min(p.horas, restante)
        restante -= toma
        const tomaMin = Math.round(toma * 60)
        empujar(p.hastaAbs - tomaMin, p.hastaAbs, toma, 'HED')
      }
    }
  }
  return tramos
}

const iso = (d: Date) => d.toISOString().slice(0, 10)

/**
 * Regenera las novedades de horas de ORIGEN ASISTENCIA de un periodo abierto:
 * borra las `arrive-…` del periodo y las recrea desde las marcaciones
 * actuales, con el corte diurno/nocturno de las 7 p.m.
 * @returns resumen para mostrar en la UI de liquidación.
 */
export async function regenerarNovedadesAsistencia(periodo: {
  id: string
  fechaInicio: Date
  fechaFin: Date
}): Promise<{ generadas: number; sinColaborador: string[] }> {
  const tramos = await calcularTramosAsistencia(iso(periodo.fechaInicio), iso(periodo.fechaFin))

  // Colaboradores por cédula (una sola consulta).
  const cedulas = [...new Set(tramos.map((t) => t.cedula))]
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
    const colab = porCedula.get(t.cedula)
    if (!colab || colab.estado === 'RETIRADO') {
      if (!sinColaborador.includes(t.cedula)) sinColaborador.push(t.cedula)
      continue
    }
    // Corte diurno/nocturno de las 7 p.m. (Ley 2466), igual que la integración.
    const { diurnas, nocturnas } = dividirDiurnoNocturno(t.horaInicio, t.horaFin)
    const pareja = PAREJA_TIPO_HORA[t.tipoHora]
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
        observaciones: 'Calculada de las marcaciones de asistencia.',
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
