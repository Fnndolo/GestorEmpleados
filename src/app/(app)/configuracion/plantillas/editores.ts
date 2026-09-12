/**
 * Los tres editores de Plantillas de documentos que se abren en ventana
 * emergente. Vive aparte (sin 'use client') porque lo usan tanto la página de
 * servidor (para leer `?abrir=`) como el componente cliente: una constante
 * exportada desde un módulo cliente llega al servidor como referencia, no como
 * valor.
 */
export type Editor = 'membrete' | 'autorizacion' | 'cuentas-cobro'
export const EDITORES: readonly Editor[] = ['membrete', 'autorizacion', 'cuentas-cobro']
