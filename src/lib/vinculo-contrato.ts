/**
 * Correspondencia entre el tipo de un contrato laboral y el tipo de vínculo de
 * la ficha del colaborador.
 *
 * Son dos campos distintos que dicen lo mismo, y se salían de sincronía sin que
 * nadie lo notara: un contrato registrado como OBRA_LABOR mientras la ficha
 * decía TERMINO_FIJO. El daño no es cosmético — las acciones disponibles se
 * deciden por el tipo del contrato (solo un fijo se prorroga) mientras que los
 * trámites del autoservicio se deciden por el vínculo de la ficha, así que la
 * persona quedaba con la mitad de las reglas de un tipo y la mitad de las de
 * otro.
 *
 * Módulo puro (sin dependencias server-only) para poder probarlo y usarlo igual
 * en la página, en el formulario y en la Server Action.
 */

/** Tipos del enum `TipoContratoLaboral`. */
export type TipoContratoLaboral =
  | 'TERMINO_FIJO' | 'TERMINO_INDEFINIDO' | 'OBRA_LABOR' | 'APRENDIZAJE_SENA' | 'PRACTICA'

/** Tipos del enum `TipoVinculo`. */
export type TipoVinculo =
  | 'TERMINO_INDEFINIDO' | 'TERMINO_FIJO' | 'OBRA_LABOR' | 'APRENDIZ_SENA' | 'OPS' | 'PRACTICANTE'

/**
 * Los dos enums nombran distinto lo mismo (APRENDIZAJE_SENA / APRENDIZ_SENA,
 * PRACTICA / PRACTICANTE), así que no se pueden comparar directamente.
 */
const VINCULO_DE_CONTRATO: Record<TipoContratoLaboral, TipoVinculo> = {
  TERMINO_FIJO: 'TERMINO_FIJO',
  TERMINO_INDEFINIDO: 'TERMINO_INDEFINIDO',
  OBRA_LABOR: 'OBRA_LABOR',
  APRENDIZAJE_SENA: 'APRENDIZ_SENA',
  PRACTICA: 'PRACTICANTE',
}

/** El vínculo que le corresponde a la ficha según el contrato firmado. */
export function vinculoDeContrato(tipo: TipoContratoLaboral): TipoVinculo {
  return VINCULO_DE_CONTRATO[tipo]
}

/** ¿La ficha y el contrato dicen lo mismo? */
export function vinculoCoincide(tipoContrato: TipoContratoLaboral, tipoVinculo: TipoVinculo): boolean {
  return VINCULO_DE_CONTRATO[tipoContrato] === tipoVinculo
}

const ETIQUETA_VINCULO: Record<TipoVinculo, string> = {
  TERMINO_INDEFINIDO: 'término indefinido',
  TERMINO_FIJO: 'término fijo',
  OBRA_LABOR: 'obra o labor',
  APRENDIZ_SENA: 'aprendiz SENA',
  OPS: 'prestación de servicios',
  PRACTICANTE: 'practicante',
}

/**
 * Explicación de la discrepancia, o null si no la hay. Se muestra tal cual en
 * el detalle del contrato: decir "hay una inconsistencia" no sirve de nada si
 * no dice cuál de los dos campos hay que corregir.
 */
export function discrepanciaVinculo(
  tipoContrato: TipoContratoLaboral,
  tipoVinculo: TipoVinculo,
): string | null {
  if (vinculoCoincide(tipoContrato, tipoVinculo)) return null
  const delContrato = ETIQUETA_VINCULO[vinculoDeContrato(tipoContrato)]
  const deLaFicha = ETIQUETA_VINCULO[tipoVinculo]
  return (
    `Este contrato es de ${delContrato}, pero la ficha del colaborador dice ${deLaFicha}. ` +
    `Las acciones del contrato se deciden por el tipo del contrato y los trámites del autoservicio ` +
    `por el vínculo de la ficha, así que mientras no coincidan la persona queda con reglas mezcladas. ` +
    `Corrige el que esté mal.`
  )
}

/** Aviso para el usuario cuando el contrato acaba de corregir el vínculo de la ficha. */
export function avisoVinculoAjustado(
  ajuste: { antes: TipoVinculo; ahora: TipoVinculo } | null | undefined,
): string | null {
  if (!ajuste) return null
  return (
    `También se corrigió la ficha del colaborador: decía ${ETIQUETA_VINCULO[ajuste.antes]} ` +
    `y ahora dice ${ETIQUETA_VINCULO[ajuste.ahora]}, igual que el contrato.`
  )
}

/** Lo que devuelven las acciones de contrato cuando alinearon la ficha. */
export type AjusteVinculo = { antes: TipoVinculo; ahora: TipoVinculo }
