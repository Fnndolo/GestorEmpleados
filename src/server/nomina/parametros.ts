import 'server-only'
import { prisma } from '@/lib/db'
import { formatFechaISO } from '@/lib/fechas'
import { ErrorNegocio } from '@/server/accion'

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
  // ErrorNegocio y no Error: esto es configuración que falta, no una falla del
  // sistema. Como Error genérico llegaba a la pantalla como 'Ocurrió un error
  // inesperado' y quien liquidaba no tenía forma de saber que le faltaba el SMMLV.
  if (!mapa.SMMLV) {
    throw new ErrorNegocio(
      `No hay SMMLV vigente para ${fechaISO}. Cárgalo en Ajustes → Parámetros de nómina; sin él no se puede liquidar ni calcular una terminación.`,
    )
  }
  return mapa
}

/** Valor vigente de un parámetro legal a hoy (0 si no existe). Útil para UI/contratos. */
export async function valorParametroVigente(clave: string): Promise<number> {
  const hoy = new Date()
  const p = await prisma.parametroLegal.findFirst({
    where: { clave, vigenciaDesde: { lte: hoy }, OR: [{ vigenciaHasta: null }, { vigenciaHasta: { gte: hoy } }] },
    orderBy: { vigenciaDesde: 'desc' },
  })
  return p ? Number(p.valor) : 0
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
