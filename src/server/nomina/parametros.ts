import 'server-only'
import { prisma } from '@/lib/db'
import { formatFechaISO } from '@/lib/fechas'

export type ParametrosNomina = Record<string, number>

/**
 * Carga todos los parámetros legales vigentes a una fecha dada (clave → valor).
 * Si una clave tiene varias vigencias, toma la más reciente que cubra la fecha.
 */
export async function cargarParametros(fecha: Date): Promise<ParametrosNomina> {
  const fechaISO = formatFechaISO(fecha)
  const todos = await prisma.parametroLegal.findMany({
    where: {
      vigenciaDesde: { lte: fecha },
      OR: [{ vigenciaHasta: null }, { vigenciaHasta: { gte: fecha } }],
    },
    orderBy: { vigenciaDesde: 'desc' },
  })
  const mapa: ParametrosNomina = {}
  for (const p of todos) {
    // El primero (más reciente) gana por clave
    if (!(p.clave in mapa)) mapa[p.clave] = Number(p.valor)
  }
  if (!mapa.SMMLV) throw new Error(`No hay SMMLV vigente para ${fechaISO}. Configura los parámetros legales.`)
  return mapa
}

/** Factor de hora extra/recargo vigente a una fecha (por código). */
export async function cargarTiposHora(fecha: Date): Promise<Record<string, number>> {
  const tipos = await prisma.tipoHora.findMany({
    where: {
      vigenteDesde: { lte: fecha },
      OR: [{ vigenteHasta: null }, { vigenteHasta: { gte: fecha } }],
    },
    orderBy: { vigenteDesde: 'desc' },
  })
  const mapa: Record<string, number> = {}
  for (const t of tipos) if (!(t.codigo in mapa)) mapa[t.codigo] = Number(t.factor)
  return mapa
}
