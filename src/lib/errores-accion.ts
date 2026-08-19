/**
 * Convierte el fallo de una Server Action en un mensaje que diga QUÉ está mal.
 *
 * `accion()` ya devuelve el detalle por campo cuando la validación falla, pero
 * las pantallas mostraban solo "Datos inválidos. Revisa el formulario.", que
 * deja al usuario buscando a ciegas en un formulario de quince campos.
 *
 * Las etiquetas traducen el nombre técnico del campo al que se ve en pantalla:
 * decir "numeroDocumento" no ayuda a quien está llenando "Número".
 */
export type ResultadoFallido = { ok: false; error: string; campos?: Record<string, string[]> }

const MAX_DETALLES = 4

export function mensajeError(res: ResultadoFallido, etiquetas: Record<string, string> = {}): string {
  const detalles = Object.entries(res.campos ?? {}).flatMap(([campo, errores]) =>
    (errores ?? []).map((e) => `${etiquetas[campo] ?? campo}: ${e}`),
  )
  if (detalles.length === 0) return res.error

  // Se recortan: una lista larga en un aviso emergente no se alcanza a leer.
  const visibles = detalles.slice(0, MAX_DETALLES).join(' · ')
  return detalles.length > MAX_DETALLES
    ? `${visibles} · y ${detalles.length - MAX_DETALLES} más`
    : visibles
}
