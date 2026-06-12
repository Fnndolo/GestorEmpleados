import 'server-only'
import { prisma } from '@/lib/db'
import { festivosDeRango, type ExcepcionFestivo } from '@/lib/dias-habiles'
import { formatFechaISO } from '@/lib/fechas'

/** Carga las excepciones de festivos de BD y construye el set para un rango de años. */
export async function cargarFestivos(anioDesde: number, anioHasta: number): Promise<Set<string>> {
  const excepciones = await prisma.festivoExcepcion.findMany()
  const mapped: ExcepcionFestivo[] = excepciones.map((e) => ({
    fecha: formatFechaISO(e.fecha),
    tipo: e.tipo,
  }))
  return festivosDeRango(anioDesde, anioHasta, mapped)
}
