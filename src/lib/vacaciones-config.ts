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
 * Para reactivarlo cuando los datos estén completos, poner en `true`.
 */
export const MOSTRAR_SALDO_VACACIONES_AUTOSERVICIO = false
