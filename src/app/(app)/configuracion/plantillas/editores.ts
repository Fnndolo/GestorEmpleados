import { CLAVES_TEXTO, type ClaveTexto } from '@/lib/plantillas-documento/textos'

/**
 * Los editores de Plantillas de documentos que se abren en ventana emergente.
 * Vive aparte (sin 'use client') porque lo usan tanto la página de servidor
 * (para leer `?abrir=`) como el componente cliente: una constante exportada
 * desde un módulo cliente llega al servidor como referencia, no como valor.
 *
 * Los textos editables (actas de Mis entregas, orden de pago de horas extra,
 * certificaciones) se abren con su propia clave: `?abrir=CERTIFICACION_LABORAL`.
 */
export type Editor = 'membrete' | 'autorizacion' | 'autorizacion-laboral' | ClaveTexto
export const EDITORES: readonly Editor[] = ['membrete', 'autorizacion', 'autorizacion-laboral', ...CLAVES_TEXTO]

/** Enlaces viejos: `?abrir=cuentas-cobro` abría la lista de plantillas de cuenta de cobro. */
export const ALIAS_EDITOR: Record<string, Editor> = { 'cuentas-cobro': 'CUENTA_COBRO' }
