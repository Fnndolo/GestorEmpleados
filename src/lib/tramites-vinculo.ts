/**
 * Qué trámites del autoservicio aplican según el tipo de vínculo.
 *
 * No es solo cosmética. Ofrecerle a un contratista de prestación de servicios
 * vacaciones, permisos, dotación o un proceso disciplinario son **indicios de
 * subordinación**: si demanda por contrato realidad, esos registros son prueba
 * en contra de la empresa. Bloquearlos protege a la empresa, no solo limpia la
 * pantalla.
 *
 * Módulo puro (sin dependencias server-only) para que lo usen igual la página,
 * el panel de trámites y cada Server Action.
 */

/**
 * Vínculos que usa la empresa. PRACTICANTE existe en el enum de la base pero no
 * se ofrece: KUPOCELL no maneja practicantes, solo aprendices SENA.
 *
 * APRENDIZ_SENA es **laboral desde el primer día** (contrato laboral especial
 * tras la reforma de 2025), así que no lleva ninguna restricción: el único
 * vínculo sin relación laboral es OPS.
 */
export type TipoVinculoClave =
  | 'TERMINO_INDEFINIDO' | 'TERMINO_FIJO' | 'OBRA_LABOR'
  | 'APRENDIZ_SENA' | 'OPS'

export type Tramite =
  | 'vacaciones'
  | 'permisos'
  | 'licencias'
  | 'incapacidades'
  | 'certificacion'
  | 'desprendibles'
  | 'disciplinarios'
  | 'dotacion'
  | 'epp'
  | 'capacitaciones'
  | 'activos'
  | 'cuentaCobro'
  | 'documentos'
  | 'miInformacion'
  | 'firmarContrato'
  | 'habeasData'
  | 'antiAcoso'

/** ¿El vínculo es de prestación de servicios (sin relación laboral)? */
export function esOps(tipoVinculo: string | null | undefined): boolean {
  return tipoVinculo === 'OPS'
}

/**
 * Trámites que NO aplican a un contrato de prestación de servicios.
 *
 * - vacaciones, permisos, licencias: prestaciones laborales que el contratista no tiene.
 * - incapacidades: las tramita con su EPS/ARL; la empresa no las reconoce ni paga.
 * - desprendibles: no hay nómina; su pago va por cuenta de cobro.
 * - disciplinarios: el poder disciplinario es el indicio más fuerte de subordinación.
 * - dotación: arts. 230-234 CST, solo empleados que ganan hasta 2 SMMLV.
 * - epp y capacitaciones: decisión de la empresa (2026-08-18) — se ocultan al OPS.
 *
 * Los activos SÍ aplican: a un contratista se le puede entregar un equipo bajo
 * custodia sin que eso implique relación laboral.
 */
const BLOQUEADOS_OPS: ReadonlySet<Tramite> = new Set<Tramite>([
  'vacaciones', 'permisos', 'licencias', 'incapacidades',
  'desprendibles', 'disciplinarios', 'dotacion', 'epp', 'capacitaciones',
])

/** ¿El colaborador con este vínculo puede usar el trámite? */
export function aplicaTramite(tipoVinculo: string | null | undefined, tramite: Tramite): boolean {
  if (esOps(tipoVinculo)) return !BLOQUEADOS_OPS.has(tramite)
  return true
}

/**
 * Aviso que se muestra en el autoservicio del contratista, en lugar de dejar que
 * busque trámites que no encontrará.
 */
export const AVISO_OPS =
  'Tu vínculo es de prestación de servicios: no aplican los trámites laborales ' +
  '(vacaciones, permisos, licencias, incapacidades, desprendibles ni dotación). ' +
  'Tus pagos se gestionan por cuenta de cobro.'

/**
 * La certificación del contratista NO es una certificación laboral: no hay cargo,
 * salario ni funciones, sino objeto contractual y valor. Se emite con plantilla
 * propia (ver `certificacion` en el módulo de certificaciones).
 */
export function claseCertificacion(tipoVinculo: string | null | undefined): 'LABORAL' | 'CONTRACTUAL' {
  return esOps(tipoVinculo) ? 'CONTRACTUAL' : 'LABORAL'
}
