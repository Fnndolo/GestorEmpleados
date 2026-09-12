import 'server-only'
import { ErrorNegocio } from '@/server/accion'
import type { PosicionFirma } from '@/server/pdf/firma-en-pdf'
import type { PdfGenerado } from '@/server/contratos-ops-pdf'
import { generarPdfContratoEstampado } from '@/server/contratos-estampar'

/**
 * Lado OPS del estampado de firmas sobre un PDF subido: qué guarda
 * `ContratoOps.posicionFirmas` y cómo se traduce a las firmas que se dibujan.
 * El estampado en sí es común a OPS y laboral (`contratos-estampar.ts`).
 */

/** Contenido de `ContratoOps.posicionFirmas`. */
export type DatosFirmaSubido = {
  contratista: PosicionFirma
  /** Nula cuando el PDF ya venía firmado por el contratante: no se le estampa nada. */
  contratante: PosicionFirma | null
  /** Documento del PDF tal como se subió: es la base sobre la que se estampa. */
  documentoOriginalId: string
}

/** Lee y valida el JSON de posiciones; sin él no hay forma de saber dónde firmar. */
export function leerDatosFirmaSubido(valor: unknown): DatosFirmaSubido {
  const d = valor as DatosFirmaSubido | null
  if (!d?.contratista || !d?.documentoOriginalId) {
    throw new ErrorNegocio(
      'Este contrato no tiene registrada la posición de las firmas dentro del PDF. Vuelve a subirlo indicando dónde firma cada parte.',
    )
  }
  return d
}

/** Estampa las firmas sobre el PDF original y guarda el resultado como Documento del contrato. */
export async function generarPdfContratoOpsEstampado(opts: {
  contratoId: string
  numero: string
  sedeId: string
  usuarioId: string
  datos: DatosFirmaSubido
  firmaContratistaImg: string
  /** Nula si el contratante ya firmó en el PDF: solo se estampa la del contratista. */
  firmaContratanteImg: string | null
  nombreDocumento?: string
}): Promise<PdfGenerado> {
  const firmas = [{ posicion: opts.datos.contratista, imagenDataUri: opts.firmaContratistaImg }]
  if (opts.datos.contratante && opts.firmaContratanteImg) {
    firmas.push({ posicion: opts.datos.contratante, imagenDataUri: opts.firmaContratanteImg })
  }
  return generarPdfContratoEstampado({
    entidadTipo: 'ContratoOps',
    carpeta: `contratos-ops/${opts.contratoId}`,
    contratoId: opts.contratoId,
    numero: opts.numero,
    sedeId: opts.sedeId,
    usuarioId: opts.usuarioId,
    documentoOriginalId: opts.datos.documentoOriginalId,
    firmas,
    nombreDocumento: opts.nombreDocumento ?? `Contrato OPS ${opts.numero} (firmado)`,
  })
}
