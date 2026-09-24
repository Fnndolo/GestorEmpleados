/**
 * Mientras se terminan de subir los datos históricos de vacaciones (saldos
 * iniciales, disfrutes de antes de la plataforma), el saldo que calcula el
 * sistema no es confiable todavía: se oculta el NÚMERO en Autoservicio (una
 * sola línea neutra en su lugar) hasta que los datos estén completos.
 *
 * Solo autoservicio: la ficha del colaborador y Talento Humano lo siguen
 * viendo siempre — ahí es donde se revisa y corrige mientras se sube la
 * información, así que ocultarlo ahí estorbaría el propio trabajo de subirla.
 *
 * Para reactivarlo para todos cuando los datos estén completos, poner en `true`.
 * Mientras tanto se muestra persona por persona: ver `saldoVisibleEnAutoservicio`.
 */
export const MOSTRAR_SALDO_VACACIONES_AUTOSERVICIO = false

/**
 * ¿Se le muestra a esta persona su saldo en Autoservicio? Sí cuando Talento
 * Humano ya confirmó en su ficha que cargó su historial de vacaciones: antes de
 * eso el número podría incluir días que ya tomó por fuera de la plataforma.
 */
export function saldoVisibleEnAutoservicio(historialCompletoEn: Date | string | null | undefined): boolean {
  return MOSTRAR_SALDO_VACACIONES_AUTOSERVICIO || !!historialCompletoEn
}

/**
 * Texto que el colaborador acepta al pedir vacaciones anticipadas (RIT art. 69
 * num. 4: toda deducción exige autorización previa y escrita para cada caso).
 * Se guarda literal en la solicitud como evidencia, así que cambiarlo aquí no
 * altera lo que otros ya aceptaron.
 *
 * `diasAnticipados`: con el historial cargado se sabe cuántos días son
 * anticipados; sin él (`null`), la autorización cubre los que resulten
 * anticipados cuando Talento Humano lo revise.
 */
export function textoAutorizacionAnticipadas(diasAnticipados: number | null): string {
  const cuales = diasAnticipados
    ? `los ${diasAnticipados} día${diasAnticipados === 1 ? '' : 's'} de vacaciones que tomo de forma anticipada (aún no causados)`
    : 'los días de estas vacaciones que resulten anticipados (aún no causados) cuando Talento Humano revise mi historial'
  return `Autorizo por escrito que, si me retiro de la empresa antes de causar ${cuales}, su valor se descuente de mi liquidación definitiva (RIT art. 69 num. 4).`
}
