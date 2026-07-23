/**
 * Catálogo de eventos que generan notificaciones. La clave (`clave`) es estable y
 * se guarda en cada `Notificacion.evento`; la usa el módulo de Configuración para
 * decidir qué eventos muestran pop-up (toast). Al agregar un aviso nuevo en el
 * código, regístralo aquí para que el administrador pueda configurarlo.
 */
export type ClaveEvento =
  | 'solicitud_creada'
  | 'solicitud_resuelta'
  | 'incapacidad_reportada'
  | 'contrato_pendiente_firma'
  | 'contrato_firmado'
  | 'cuenta_cobro_radicada'
  | 'denuncia_acoso'
  | 'habeas_data'
  | 'disciplinario_citacion'
  | 'disciplinario_descargos'
  | 'disciplinario_avance'
  | 'disciplinario_decision'
  | 'disciplinario_apelacion'
  | 'disciplinario_cerrado'
  | 'vencimiento_alerta'

export type EventoNotif = {
  clave: ClaveEvento
  etiqueta: string
  descripcion: string
  modulo: string
}

export const EVENTOS_NOTIF: EventoNotif[] = [
  // Autoservicio / Solicitudes
  { clave: 'solicitud_creada', etiqueta: 'Solicitud creada', descripcion: 'Un colaborador radica una solicitud (permiso, vacaciones, etc.).', modulo: 'Autoservicio' },
  { clave: 'solicitud_resuelta', etiqueta: 'Solicitud aprobada o rechazada', descripcion: 'La solicitud del colaborador avanza, se aprueba o se rechaza.', modulo: 'Autoservicio' },
  { clave: 'incapacidad_reportada', etiqueta: 'Incapacidad reportada', descripcion: 'Un colaborador reporta una incapacidad a su jefe.', modulo: 'Autoservicio' },

  // Contratos OPS
  { clave: 'contrato_pendiente_firma', etiqueta: 'Contrato pendiente de firma', descripcion: 'Se crea un contrato OPS que el contratista debe firmar.', modulo: 'Contratos' },
  { clave: 'contrato_firmado', etiqueta: 'Contrato firmado', descripcion: 'El contratista (o ambas partes) firma el contrato OPS.', modulo: 'Contratos' },

  // Cuentas de cobro
  { clave: 'cuenta_cobro_radicada', etiqueta: 'Cuenta de cobro radicada', descripcion: 'Un contratista radica una nueva cuenta de cobro.', modulo: 'Cuentas de cobro' },

  // Jurídica
  { clave: 'denuncia_acoso', etiqueta: 'Denuncia anti-acoso', descripcion: 'Se recibe una nueva denuncia por el canal anti-acoso.', modulo: 'Jurídica' },
  { clave: 'habeas_data', etiqueta: 'Consulta / reclamo de habeas data', descripcion: 'Un colaborador presenta una consulta o reclamo (Ley 1581).', modulo: 'Jurídica' },
  { clave: 'disciplinario_citacion', etiqueta: 'Citación a descargos', descripcion: 'Se cita al colaborador a descargos en un proceso disciplinario.', modulo: 'Jurídica' },
  { clave: 'disciplinario_descargos', etiqueta: 'Descargos presentados', descripcion: 'El colaborador presenta sus descargos.', modulo: 'Jurídica' },
  { clave: 'disciplinario_avance', etiqueta: 'Avance de proceso disciplinario', descripcion: 'El proceso disciplinario cambia de etapa.', modulo: 'Jurídica' },
  { clave: 'disciplinario_decision', etiqueta: 'Decisión del proceso', descripcion: 'Se toma una decisión en el proceso disciplinario.', modulo: 'Jurídica' },
  { clave: 'disciplinario_apelacion', etiqueta: 'Recurso de apelación', descripcion: 'El colaborador presenta un recurso de apelación.', modulo: 'Jurídica' },
  { clave: 'disciplinario_cerrado', etiqueta: 'Proceso disciplinario cerrado', descripcion: 'Se cierra el proceso disciplinario.', modulo: 'Jurídica' },

  // Vencimientos / automáticas (incluye alertas de documentos y de obligaciones del calendario legal)
  { clave: 'vencimiento_alerta', etiqueta: 'Alerta de vencimiento', descripcion: 'Aviso automático de un vencimiento u obligación legal próxima (10 días hábiles antes y última alerta).', modulo: 'Vencimientos' },
]

const CLAVES = new Set<string>(EVENTOS_NOTIF.map((e) => e.clave))

/** True si la clave existe en el catálogo. */
export function esEventoValido(clave: string): clave is ClaveEvento {
  return CLAVES.has(clave)
}
