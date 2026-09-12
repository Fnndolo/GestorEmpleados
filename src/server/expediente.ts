import 'server-only'
import type { TipoDocumento, TipoVinculo } from '@/generated/prisma/client'
import { prisma } from '@/lib/db'

/**
 * Expediente del colaborador: qué documentos se le exigen y cuáles le faltan.
 *
 * La regla vive en Ajustes → Tipos de documento (obligatorios por tipo de
 * vínculo). Aquí se le suma lo que no depende del vínculo sino del cargo —la
 * tarjeta profesional— para que las tres pantallas que lo calculan (inicio del
 * autoservicio, Mis documentos y la ficha) digan lo mismo.
 */

/** Se resuelve desde el módulo de Contratos, no con un archivo que suba la persona. */
export const TIPO_CONTRATO_FIRMADO = 'Contrato firmado'
/** Se exige solo cuando el cargo lo pide (`Cargo.requiereTarjetaProfesional`). */
export const TIPO_TARJETA_PROFESIONAL = 'Tarjeta profesional'

export type RequeridoExpediente = {
  tipoDocumentoId: string
  obligatorio: boolean
  tipoDocumento: TipoDocumento
}

/** Documentos que se le exigen: los del vínculo más la tarjeta profesional si su cargo la pide. */
export async function documentosRequeridosDe(colab: {
  tipoVinculo: TipoVinculo
  cargoId: string | null
}): Promise<RequeridoExpediente[]> {
  const base = await prisma.documentoRequerido.findMany({
    where: { tipoVinculo: colab.tipoVinculo },
    include: { tipoDocumento: true },
  })
  const lista: RequeridoExpediente[] = base.map((r) => ({
    tipoDocumentoId: r.tipoDocumentoId,
    obligatorio: r.obligatorio,
    tipoDocumento: r.tipoDocumento,
  }))
  if (!colab.cargoId || lista.some((r) => r.tipoDocumento.nombre === TIPO_TARJETA_PROFESIONAL)) return lista

  const cargo = await prisma.cargo.findUnique({
    where: { id: colab.cargoId },
    select: { requiereTarjetaProfesional: true },
  })
  if (!cargo?.requiereTarjetaProfesional) return lista
  const tarjeta = await prisma.tipoDocumento.findFirst({ where: { nombre: TIPO_TARJETA_PROFESIONAL, activo: true } })
  if (tarjeta) lista.push({ tipoDocumentoId: tarjeta.id, obligatorio: true, tipoDocumento: tarjeta })
  return lista
}

/**
 * Nombres de los documentos obligatorios que el colaborador aún no ha subido a
 * su expediente. No cuenta el contrato firmado: ese no lo sube él, sale de
 * Contratos.
 */
export async function documentosFaltantesDe(colaboradorId: string): Promise<string[]> {
  const colab = await prisma.colaborador.findUnique({
    where: { id: colaboradorId },
    select: { tipoVinculo: true, cargoId: true },
  })
  if (!colab) return []
  const [requeridos, entregados] = await Promise.all([
    documentosRequeridosDe(colab),
    prisma.documento.findMany({
      where: { entidadTipo: 'Colaborador', entidadId: colaboradorId, tipoDocumentoId: { not: null } },
      select: { tipoDocumentoId: true },
    }),
  ])
  const tiene = new Set(entregados.map((d) => d.tipoDocumentoId))
  return requeridos
    .filter((r) => r.obligatorio && r.tipoDocumento.nombre !== TIPO_CONTRATO_FIRMADO && !tiene.has(r.tipoDocumentoId))
    .map((r) => r.tipoDocumento.nombre)
}
