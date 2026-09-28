import type { ClaveTexto } from '@/lib/plantillas-documento/textos'

/**
 * Cartas de la terminación: cuál corresponde a cada tipo, cómo se llama, qué
 * texto editable usa y quién la firma. Puras: las comparten el servidor, la
 * pantalla y las muestras de Ajustes.
 */

export type TipoCarta = 'CARTA_RENUNCIA' | 'ACEPTACION_RENUNCIA' | 'CARTA_TERMINACION' | 'NO_PRORROGA' | 'ACTA_MUTUO_ACUERDO'

/** La carta obligatoria de cada tipo de terminación (sin ella no se cierra). */
export const CARTA_PRINCIPAL: Record<string, TipoCarta> = {
  RENUNCIA_VOLUNTARIA: 'ACEPTACION_RENUNCIA',
  SIN_JUSTA_CAUSA: 'CARTA_TERMINACION',
  CON_JUSTA_CAUSA: 'CARTA_TERMINACION',
  TERMINACION_ANTICIPADA: 'CARTA_TERMINACION',
  PERIODO_PRUEBA: 'CARTA_TERMINACION',
  FIN_OPS: 'CARTA_TERMINACION',
  VENCIMIENTO_PLAZO: 'NO_PRORROGA',
  MUTUO_ACUERDO: 'ACTA_MUTUO_ACUERDO',
}

export const NOMBRE_CARTA: Record<TipoCarta, string> = {
  CARTA_RENUNCIA: 'Carta de renuncia',
  ACEPTACION_RENUNCIA: 'Aceptación de la renuncia',
  CARTA_TERMINACION: 'Carta de terminación',
  NO_PRORROGA: 'Aviso de no prórroga',
  ACTA_MUTUO_ACUERDO: 'Acta de mutuo acuerdo',
}

export const CLAVE_TEXTO_CARTA: Record<TipoCarta, ClaveTexto> = {
  CARTA_RENUNCIA: 'CARTA_RENUNCIA',
  ACEPTACION_RENUNCIA: 'CARTA_ACEPTACION_RENUNCIA',
  CARTA_TERMINACION: 'CARTA_TERMINACION',
  NO_PRORROGA: 'CARTA_NO_PRORROGA',
  ACTA_MUTUO_ACUERDO: 'ACTA_MUTUO_ACUERDO',
}

/** Quién firma cada documento de texto de la terminación. */
export type FirmasDoc = 'ambas' | 'trabajador' | 'empresa'

export const FIRMAS_TEXTO: Partial<Record<ClaveTexto, FirmasDoc>> = {
  CARTA_RENUNCIA: 'trabajador',
  CARTA_ACEPTACION_RENUNCIA: 'ambas',
  CARTA_TERMINACION: 'ambas',
  CARTA_NO_PRORROGA: 'ambas',
  ACTA_MUTUO_ACUERDO: 'ambas',
  ORDEN_EXAMEN_EGRESO: 'empresa',
}
