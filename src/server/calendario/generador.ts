import 'server-only'
import { prisma } from '@/lib/db'
import { publicarVencimiento } from '@/server/vencimientos/servicio'
import { hoyBogota, formatFechaISO } from '@/lib/fechas'

/**
 * Genera las ocurrencias de las obligaciones legales dentro de un horizonte
 * (por defecto 120 días) y publica su Vencimiento (alertas 5 hábiles / 1 día).
 * Idempotente: no duplica ocurrencias ya existentes.
 */
export async function generarOcurrencias(horizonteDias = 120): Promise<{ creadas: number }> {
  const hoy = hoyBogota()
  const limite = new Date(hoy)
  limite.setUTCDate(limite.getUTCDate() + horizonteDias)

  const obligaciones = await prisma.obligacionLegal.findMany({ where: { activa: true } })
  const sedes = await prisma.sede.findMany({ where: { activa: true }, select: { id: true, nombre: true } })

  let creadas = 0
  for (const o of obligaciones) {
    const fechas = proximasFechas(o, hoy, limite)
    const destinos = o.porSede ? sedes : [{ id: null as string | null, nombre: null as string | null }]

    for (const fecha of fechas) {
      for (const sede of destinos) {
        const existe = await prisma.ocurrenciaObligacion.findFirst({
          where: { obligacionId: o.id, fechaLimite: fecha, sedeId: sede.id },
        })
        if (existe) continue
        const oc = await prisma.ocurrenciaObligacion.create({
          data: { obligacionId: o.id, fechaLimite: fecha, sedeId: sede.id, estado: 'PENDIENTE' },
        })
        creadas++
        // Publicar vencimiento (regla OBLIGACION_LEGAL = 5 hábiles / 1 día)
        await publicarVencimiento({
          origen: 'OBLIGACION_LEGAL',
          entidadTipo: 'OcurrenciaObligacion',
          entidadId: oc.id,
          titulo: `${o.nombre}${sede.nombre ? ` — ${sede.nombre}` : ''}`,
          detalle: o.fuenteLegal,
          fechaVencimientoISO: formatFechaISO(fecha),
          sedeId: sede.id,
          responsables: o.responsableRol ? [{ rol: o.responsableRol }] : undefined,
        })
      }
    }
  }
  return { creadas }
}

type Obligacion = {
  periodicidad: string; mesBase: number | null; diaBase: number | null
  mesesBase: string | null; cadaNAnios: number | null
}

/** Calcula las fechas de vencimiento de una obligación entre `desde` y `hasta`. */
function proximasFechas(o: Obligacion, desde: Date, hasta: Date): Date[] {
  const dia = o.diaBase ?? 1
  const fechas: Date[] = []
  const anioInicio = desde.getUTCFullYear()
  const anioFin = hasta.getUTCFullYear()

  const agregar = (anio: number, mes: number) => {
    const f = new Date(Date.UTC(anio, mes - 1, Math.min(dia, 28)))
    if (f >= desde && f <= hasta) fechas.push(f)
  }

  for (let anio = anioInicio; anio <= anioFin; anio++) {
    switch (o.periodicidad) {
      case 'MENSUAL':
        for (let m = 1; m <= 12; m++) agregar(anio, m)
        break
      case 'BIMESTRAL':
        for (let m = 1; m <= 12; m += 2) agregar(anio, m)
        break
      case 'CUATRIMESTRAL':
        for (let m = 1; m <= 12; m += 4) agregar(anio, m)
        break
      case 'SEMESTRAL':
        (o.mesesBase ?? '6,12').split(',').forEach((ms) => agregar(anio, Number(ms.trim())))
        break
      case 'ANUAL':
        agregar(anio, o.mesBase ?? 1)
        break
      case 'CADA_N_ANIOS':
        if (o.cadaNAnios && o.cadaNAnios > 0 && (anio - 2024) % o.cadaNAnios === 0) agregar(anio, o.mesBase ?? 1)
        break
      // POR_EVENTO: no genera ocurrencias automáticas
    }
  }
  return fechas
}
