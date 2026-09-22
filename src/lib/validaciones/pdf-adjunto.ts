import { z } from 'zod'

/**
 * Cómo llega un PDF a una Server Action: por referencia al depósito temporal
 * (`pdfRef`, la vía actual, hasta 10 MB) o como data URI base64 (`pdfBase64`,
 * la vía antigua, que siguen usando las pruebas y los archivos pequeños). Los
 * esquemas que exigen un PDF agregan estos campos y el refinamiento; el
 * servidor los resuelve con `obtenerPdfAdjunto`.
 */
export const pdfAdjuntoCampos = {
  pdfBase64: z.string().startsWith('data:application/pdf', 'El archivo debe ser un PDF').optional().or(z.literal('')),
  pdfRef: z.string().min(16).max(2000).optional().or(z.literal('')),
}

/** Segundo PDF opcional (la autorización de datos firmada en físico). */
export const autorizacionAdjuntaCampos = {
  autorizacionBase64: z.string().startsWith('data:application/pdf', 'La autorización debe ser un PDF').optional().or(z.literal('')),
  autorizacionRef: z.string().min(16).max(2000).optional().or(z.literal('')),
}

export type PdfAdjunto = { pdfBase64?: string | null; pdfRef?: string | null }

export const tienePdfAdjunto = (d: PdfAdjunto) => Boolean(d.pdfRef || d.pdfBase64)

/** `.refine(...exigirPdf('Adjunta el PDF del contrato'))` */
export function exigirPdf(mensaje: string): [(d: PdfAdjunto) => boolean, { message: string; path: string[] }] {
  return [tienePdfAdjunto, { message: mensaje, path: ['pdfBase64'] }]
}
