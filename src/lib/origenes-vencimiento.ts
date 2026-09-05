/**
 * Tipos de vencimiento que pueden tener su propia regla de alerta, con el
 * nombre que ve la gente. La clave coincide con el enum `OrigenVencimiento`
 * de Prisma y con la que resuelve `publicarVencimiento`.
 *
 * Módulo puro para que lo usen igual el formulario y la Server Action.
 */

export const ETIQUETA_ORIGEN = {
  DOCUMENTO: 'Documentos del expediente',
  CONTRATO_FIJO: 'Contratos a término fijo',
  CONTRATO_OPS: 'Contratos de prestación de servicios (OPS)',
  PERIODO_PRUEBA: 'Fin del período de prueba',
  EXAMEN_MEDICO: 'Exámenes médicos ocupacionales',
  PLANILLA_SS_OPS: 'Planilla de seguridad social (OPS)',
  OBLIGACION_LEGAL: 'Calendario de obligaciones legales',
  POLIZA: 'Pólizas',
  ARRIENDO: 'Contratos de arriendo',
  CONVENIO_FINANCIERA: 'Convenios con entidades financieras',
  MARCA: 'Registro de marcas',
  DOMINIO_WEB: 'Dominios web',
  LICENCIA_SOFTWARE: 'Licencias de software',
  COMITE: 'Vigencia de comités',
  ACCION_CORRECTIVA: 'Acciones correctivas',
  EPP: 'Elementos de protección personal',
  DOTACION: 'Entregas de dotación',
  PLAN_EMERGENCIA: 'Planes de emergencia',
  MODULO_PERSONALIZADO: 'Módulos personalizados',
  MANUAL: 'Vencimientos manuales',
} as const

export type OrigenAlerta = keyof typeof ETIQUETA_ORIGEN

/** Las claves, en el orden en que se ofrecen al crear una regla. */
export const ORIGENES_ALERTA = Object.keys(ETIQUETA_ORIGEN) as [OrigenAlerta, ...OrigenAlerta[]]

/**
 * Nombre de una regla ya guardada. `GLOBAL` no está en el enum de orígenes: es
 * el comodín del que heredan los tipos sin regla propia.
 */
export function nombreRegla(clave: string): string {
  if (clave === 'GLOBAL') return 'Regla global (por defecto)'
  return ETIQUETA_ORIGEN[clave as OrigenAlerta] ?? clave
}
