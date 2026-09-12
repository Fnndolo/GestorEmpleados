import 'server-only'
import { ErrorNegocio } from '@/server/accion'
import type { PosicionFirma } from '@/server/pdf/firma-en-pdf'
import type { PdfGenerado } from '@/server/contratos-ops-pdf'
import { generarPdfContratoEstampado } from '@/server/contratos-estampar'

/**
 * Lado LABORAL del estampado de firmas sobre un PDF subido: espejo de
 * `contratos-ops-estampar.ts` con las partes de un contrato de trabajo.
 */

/** Contenido de `Contrato.posicionFirmas`. */
export type DatosFirmaSubidoLaboral = {
  empleado: PosicionFirma
  /** Nula cuando el PDF ya venía firmado por el empleador: no se le estampa nada. */
  empleador: PosicionFirma | null
  /** Documento del PDF tal como se subió: es la base sobre la que se estampa. */
  documentoOriginalId: string
}

/** Lee y valida el JSON de posiciones; sin él no hay forma de saber dónde firmar. */
export function leerDatosFirmaSubidoLaboral(valor: unknown): DatosFirmaSubidoLaboral {
  const d = valor as DatosFirmaSubidoLaboral | null
  if (!d?.empleado || !d?.documentoOriginalId) {
    throw new ErrorNegocio(
      'Este contrato no tiene registrada la posición de las firmas dentro del PDF. Vuelve a subirlo indicando dónde firma cada parte.',
    )
  }
  return d
}

/** Estampa las firmas sobre el PDF original y guarda el resultado como Documento del contrato. */
export async function generarPdfContratoLaboralEstampado(opts: {
  contratoId: string
  numero: string
  sedeId: string
  usuarioId: string
  datos: DatosFirmaSubidoLaboral
  firmaEmpleadoImg: string
  /** Nula si el empleador ya firmó en el PDF: solo se estampa la del empleado. */
  firmaEmpleadorImg: string | null
  nombreDocumento?: string
}): Promise<PdfGenerado> {
  const firmas = [{ posicion: opts.datos.empleado, imagenDataUri: opts.firmaEmpleadoImg }]
  if (opts.datos.empleador && opts.firmaEmpleadorImg) {
    firmas.push({ posicion: opts.datos.empleador, imagenDataUri: opts.firmaEmpleadorImg })
  }
  return generarPdfContratoEstampado({
    entidadTipo: 'Contrato',
    carpeta: `contratos/${opts.contratoId}`,
    contratoId: opts.contratoId,
    numero: opts.numero,
    sedeId: opts.sedeId,
    usuarioId: opts.usuarioId,
    documentoOriginalId: opts.datos.documentoOriginalId,
    firmas,
    nombreDocumento: opts.nombreDocumento ?? `Contrato laboral ${opts.numero} (firmado)`,
  })
}
