/** Motivos de cierre de un contrato OPS, como se muestran en pantalla y en los avisos. */
export const MOTIVO_CIERRE_TEXTO = {
  VENCIMIENTO_PLAZO: 'vencimiento del plazo',
  TERMINACION_ANTICIPADA: 'terminación anticipada',
  MUTUO_ACUERDO: 'mutuo acuerdo',
  RETIRO: 'retiro del contratista',
} as const

export type MotivoCierreOps = keyof typeof MOTIVO_CIERRE_TEXTO
