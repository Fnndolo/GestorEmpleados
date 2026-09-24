import { sumarDiasHabiles } from '@/lib/dias-habiles'

/**
 * Comprobante de asistencia de un permiso: la constancia de que el colaborador
 * sí fue a la cita, diligencia o trámite por el que pidió el permiso.
 *
 * Helpers puros (sin BD) para poder probarlos. La parte que toca la base vive
 * en `src/server/comprobante-permiso.ts`.
 */

/** Estados guardados en `Permiso.comprobanteEstado`. */
export type EstadoComprobante = 'NO_REQUERIDO' | 'PENDIENTE' | 'ENTREGADO' | 'VERIFICADO'

/**
 * Lo que ve la gente: además de los estados guardados, un pendiente cuyo plazo
 * ya pasó se muestra como "vencido". No se guarda porque depende del día en
 * que se mira.
 */
export type SituacionComprobante = EstadoComprobante | 'VENCIDO'

/** Plazo (días hábiles) mientras nadie lo cambie en Ajustes → Empresa. */
export const PLAZO_COMPROBANTE_POR_DEFECTO = 3

/**
 * Fecha límite para entregar el comprobante: `plazoDias` días hábiles contados
 * desde el día del permiso o desde hoy, lo que sea posterior. Un permiso que se
 * aprueba o se registra después de su fecha no puede nacer ya vencido.
 */
export function fechaLimiteComprobante(
  fechaPermiso: Date,
  hoy: Date,
  plazoDias: number,
  festivos: Set<string>,
  sabadoHabil = true,
): Date {
  const base = fechaPermiso > hoy ? fechaPermiso : hoy
  return sumarDiasHabiles(base, Math.max(0, Math.floor(plazoDias)), festivos, sabadoHabil)
}

/** Situación visible del comprobante en la fecha `hoy`. */
export function situacionComprobante(estado: EstadoComprobante, vence: Date | null, hoy: Date): SituacionComprobante {
  if (estado === 'PENDIENTE' && vence && vence < hoy) return 'VENCIDO'
  return estado
}

/**
 * Etiqueta y tono (mismos tonos que `Pill` del ui-kit) por situación. `corto`
 * es para el celular, con el ícono de comprobante al lado: la etiqueta entera
 * no cabe en la misma línea que "Autoservicio" y "Soporte".
 */
export const ETIQUETA_COMPROBANTE: Record<SituacionComprobante, { label: string; corto: string; tone: 'ok' | 'info' | 'warn' | 'bad' | 'muted' }> = {
  NO_REQUERIDO: { label: 'Sin comprobante', corto: 'No exigido', tone: 'muted' },
  PENDIENTE: { label: 'Comprobante pendiente', corto: 'Pendiente', tone: 'warn' },
  VENCIDO: { label: 'Comprobante vencido', corto: 'Vencido', tone: 'bad' },
  ENTREGADO: { label: 'Comprobante por verificar', corto: 'Por verificar', tone: 'info' },
  VERIFICADO: { label: 'Comprobante verificado', corto: 'Verificado', tone: 'ok' },
}
