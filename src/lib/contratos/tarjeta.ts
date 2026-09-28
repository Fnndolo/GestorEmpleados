/**
 * Datos de la tarjeta de contrato que comparten el autoservicio (Mis contratos)
 * y la pestaña Contrato de la ficha del colaborador: el mismo contrato se ve
 * igual desde los dos lados.
 */

export const TIPO_LABORAL_CORTO: Record<string, string> = {
  TERMINO_FIJO: 'Término fijo', TERMINO_INDEFINIDO: 'Término indefinido',
  OBRA_LABOR: 'Obra o labor', APRENDIZAJE_SENA: 'Aprendizaje SENA', PRACTICA: 'Práctica',
}

/** Cómo van las firmas: completas, pendientes o sin flujo de firma en la app. */
export type FirmaContrato = 'completa' | 'pendiente' | null

/**
 * Firmas de un contrato laboral. El que se subió ya firmado en físico cuenta
 * como firmado; el empleador puede haber firmado en el PDF aportado.
 */
export function firmaContratoLaboral(c: {
  origenPdf: string; contenidoPdf: unknown
  firmaEmpleadoPath: string | null; firmaEmpleadorPath: string | null; firmaEmpleadorEnPdf: boolean
}): FirmaContrato {
  if (c.origenPdf === 'SUBIDO') return 'completa'
  if (c.firmaEmpleadoPath && (c.firmaEmpleadorPath || c.firmaEmpleadorEnPdf)) return 'completa'
  const tieneDocumento = !!c.contenidoPdf || c.origenPdf === 'SUBIDO_PARA_FIRMA'
  return tieneDocumento ? 'pendiente' : null
}

/** Lo mismo para un contrato de prestación de servicios (OPS). */
export function firmaContratoOps(c: {
  origenPdf: string; contenidoPdf: unknown
  firmaContratistaPath: string | null; firmaContratantePath: string | null; firmaContratanteEnPdf: boolean
}): FirmaContrato {
  if (c.origenPdf === 'SUBIDO') return 'completa'
  if (c.firmaContratistaPath && (c.firmaContratantePath || c.firmaContratanteEnPdf)) return 'completa'
  const tieneDocumento = !!c.contenidoPdf || c.origenPdf === 'SUBIDO_PARA_FIRMA'
  return tieneDocumento ? 'pendiente' : null
}

/**
 * Los documentos que se muestran. Cuando ya existe «X (firmado)», el original
 * «X» sobra: con el nombre recortado en el celular eran dos filas idénticas y
 * no se sabía cuál abrir. Lo demás (autorización, escaneos con nombre de
 * archivo) se lista tal cual.
 */
export function documentosVisibles<T extends { nombre: string }>(docs: T[]): T[] {
  const nombres = new Set(docs.map((d) => d.nombre))
  return docs.filter((d) => !nombres.has(`${d.nombre} (firmado)`))
}
