/**
 * ¿Se ofrece redactar contratos desde plantilla dentro de la app?
 *
 * Decisión del usuario (2026-09-10): por ahora NO. Los contratos —laborales y
 * OPS— entran únicamente subiendo el PDF ya redactado. Todo lo de plantilla
 * (el split-screen de OPS, la sección "Documento del contrato" y la vista previa
 * del laboral, los botones de editar/regenerar el documento y la pestaña
 * "Contratos" de Plantillas) queda OCULTO, no borrado: basta poner esto en
 * `true` para recuperarlo tal como estaba.
 */
export const GENERAR_CONTRATOS_DESDE_PLANTILLA = false
