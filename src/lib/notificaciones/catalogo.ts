/**
 * Catálogo de eventos que generan notificaciones. La clave (`clave`) es estable y
 * se guarda en cada `Notificacion.evento`; la usa el módulo de Configuración para
 * decidir qué eventos muestran pop-up (toast) y cuáles además mandan correo. Al
 * agregar un aviso nuevo en el código, regístralo aquí para que el administrador
 * pueda configurarlo.
 */
export type ClaveEvento =
  // Autoservicio / solicitudes
  | 'solicitud_creada'
  | 'solicitud_resuelta'
  | 'incapacidad_reportada'
  | 'ficha_actualizada'
  | 'documento_aportado'
  // Contratos
  | 'contrato_pendiente_firma'
  | 'contrato_por_firmar'
  | 'contrato_firmado'
  | 'contrato_actualizado'
  // Cuentas de cobro
  | 'cuenta_cobro_radicada'
  | 'cuenta_cobro_estado'
  | 'soporte_ss_adjuntado'
  | 'soporte_ss_invalido'
  // Vacaciones
  | 'vacaciones_programadas'
  | 'vacaciones_colectivas'
  | 'vacaciones_interrumpidas'
  | 'vacaciones_reanudadas'
  | 'vacaciones_liquidadas'
  // Activos, dotación y SST
  | 'activo_asignado'
  | 'dotacion_entregada'
  | 'dotacion_firmada'
  | 'epp_entregado'
  // Capacitaciones
  | 'capacitacion_convocatoria'
  // Jurídica
  | 'denuncia_acoso'
  | 'habeas_data'
  | 'llamado_atencion'
  | 'disciplinario_citacion'
  | 'disciplinario_descargos'
  | 'disciplinario_avance'
  | 'disciplinario_decision'
  | 'disciplinario_apelacion'
  | 'disciplinario_cerrado'
  // Vencimientos
  | 'vencimiento_alerta'

export type EventoNotif = {
  clave: ClaveEvento
  etiqueta: string
  descripcion: string
  modulo: string
  /**
   * Si además del aviso en la app se manda correo, mientras nadie lo cambie en
   * Ajustes. Solo va en `true` donde hay un plazo legal corriendo o la persona
   * tiene que hacer algo fuera de la plataforma: un correo por cada movimiento
   * llena la bandeja y termina consiguiendo que no se lea ninguno.
   */
  correoPorDefecto?: boolean
}

export const EVENTOS_NOTIF: EventoNotif[] = [
  // Autoservicio / Solicitudes
  { clave: 'solicitud_creada', etiqueta: 'Solicitud creada', descripcion: 'Un colaborador radica una solicitud (permiso, vacaciones, etc.).', modulo: 'Autoservicio' },
  { clave: 'solicitud_resuelta', etiqueta: 'Solicitud aprobada o rechazada', descripcion: 'La solicitud del colaborador avanza, se aprueba o se rechaza.', modulo: 'Autoservicio' },
  { clave: 'incapacidad_reportada', etiqueta: 'Incapacidad reportada', descripcion: 'Un colaborador reporta una incapacidad a su jefe.', modulo: 'Autoservicio' },
  { clave: 'ficha_actualizada', etiqueta: 'Ficha actualizada', descripcion: 'El colaborador completa o corrige datos de su ficha.', modulo: 'Autoservicio' },
  { clave: 'documento_aportado', etiqueta: 'Documento aportado', descripcion: 'El colaborador sube un documento a su expediente.', modulo: 'Autoservicio' },

  // Contratos
  { clave: 'contrato_pendiente_firma', etiqueta: 'Contrato pendiente de firma', descripcion: 'Se crea un contrato que el colaborador debe firmar.', modulo: 'Contratos', correoPorDefecto: true },
  { clave: 'contrato_por_firmar', etiqueta: 'Falta tu firma en el contrato', descripcion: 'Una parte firmó y falta la otra.', modulo: 'Contratos', correoPorDefecto: true },
  { clave: 'contrato_firmado', etiqueta: 'Contrato firmado', descripcion: 'Se completan las firmas del contrato.', modulo: 'Contratos' },
  { clave: 'contrato_actualizado', etiqueta: 'Contrato actualizado', descripcion: 'Se modifica un contrato ya existente.', modulo: 'Contratos' },

  // Cuentas de cobro
  { clave: 'cuenta_cobro_radicada', etiqueta: 'Cuenta de cobro radicada', descripcion: 'Se radica una cuenta de cobro.', modulo: 'Cuentas de cobro' },
  { clave: 'cuenta_cobro_estado', etiqueta: 'Cambio de estado de la cuenta', descripcion: 'La cuenta se aprueba, se paga o se rechaza.', modulo: 'Cuentas de cobro' },
  { clave: 'soporte_ss_adjuntado', etiqueta: 'Planilla de seguridad social adjuntada', descripcion: 'El contratista adjunta su PILA a la cuenta.', modulo: 'Cuentas de cobro' },
  { clave: 'soporte_ss_invalido', etiqueta: 'Planilla rechazada', descripcion: 'El soporte de seguridad social no cumple y hay que corregirlo.', modulo: 'Cuentas de cobro' },

  // Vacaciones
  { clave: 'vacaciones_programadas', etiqueta: 'Vacaciones programadas', descripcion: 'Se programan vacaciones al colaborador.', modulo: 'Vacaciones' },
  { clave: 'vacaciones_colectivas', etiqueta: 'Vacaciones colectivas', descripcion: 'Se decreta un periodo de vacaciones colectivas.', modulo: 'Vacaciones' },
  { clave: 'vacaciones_interrumpidas', etiqueta: 'Vacaciones interrumpidas', descripcion: 'Se interrumpe un disfrute en curso.', modulo: 'Vacaciones' },
  { clave: 'vacaciones_reanudadas', etiqueta: 'Vacaciones reanudadas', descripcion: 'Se reanuda un disfrute interrumpido.', modulo: 'Vacaciones' },
  { clave: 'vacaciones_liquidadas', etiqueta: 'Vacaciones liquidadas', descripcion: 'Se liquidan las vacaciones del colaborador.', modulo: 'Vacaciones' },

  // Activos, dotación y SST
  { clave: 'activo_asignado', etiqueta: 'Activo asignado', descripcion: 'Se entrega un activo en custodia y hay que firmar el acta.', modulo: 'Activos y dotación' },
  { clave: 'dotacion_entregada', etiqueta: 'Dotación entregada', descripcion: 'Se registra la entrega de dotación.', modulo: 'Activos y dotación' },
  { clave: 'dotacion_firmada', etiqueta: 'Recibido de dotación firmado', descripcion: 'El colaborador firma el recibido.', modulo: 'Activos y dotación' },
  { clave: 'epp_entregado', etiqueta: 'EPP entregado', descripcion: 'Se registra la entrega de elementos de protección personal.', modulo: 'Activos y dotación' },

  // Capacitaciones
  { clave: 'capacitacion_convocatoria', etiqueta: 'Convocatoria a capacitación', descripcion: 'Se cita a los colaboradores a una capacitación.', modulo: 'Capacitaciones' },

  // Jurídica
  { clave: 'denuncia_acoso', etiqueta: 'Reporte de la línea ética', descripcion: 'Llega un reporte por la línea ética (acoso, irregularidad o sugerencia).', modulo: 'Jurídica', correoPorDefecto: true },
  { clave: 'habeas_data', etiqueta: 'Consulta / reclamo de habeas data', descripcion: 'Un colaborador presenta una consulta o reclamo (Ley 1581): corre plazo de 10 o 15 días hábiles.', modulo: 'Jurídica', correoPorDefecto: true },
  { clave: 'llamado_atencion', etiqueta: 'Llamado de atención', descripcion: 'Se registra un llamado de atención.', modulo: 'Jurídica' },
  { clave: 'disciplinario_citacion', etiqueta: 'Citación a descargos', descripcion: 'Se cita al colaborador a descargos: corre el plazo de 5 días hábiles de su derecho de defensa.', modulo: 'Jurídica', correoPorDefecto: true },
  { clave: 'disciplinario_descargos', etiqueta: 'Descargos presentados', descripcion: 'El colaborador presenta sus descargos.', modulo: 'Jurídica' },
  { clave: 'disciplinario_avance', etiqueta: 'Avance de proceso disciplinario', descripcion: 'El proceso disciplinario cambia de etapa.', modulo: 'Jurídica' },
  { clave: 'disciplinario_decision', etiqueta: 'Decisión del proceso', descripcion: 'Se toma una decisión: corre el plazo de 5 días hábiles para apelar.', modulo: 'Jurídica', correoPorDefecto: true },
  { clave: 'disciplinario_apelacion', etiqueta: 'Recurso de apelación', descripcion: 'El colaborador presenta un recurso de apelación.', modulo: 'Jurídica' },
  { clave: 'disciplinario_cerrado', etiqueta: 'Proceso disciplinario cerrado', descripcion: 'Se cierra el proceso disciplinario.', modulo: 'Jurídica' },

  // Vencimientos / automáticas (incluye alertas de documentos y de obligaciones del calendario legal)
  { clave: 'vencimiento_alerta', etiqueta: 'Alerta de vencimiento', descripcion: 'Aviso automático de un vencimiento u obligación legal próxima (10 días hábiles antes y última alerta).', modulo: 'Vencimientos' },
]

/** Eventos que mandan correo mientras nadie cambie la preferencia en Ajustes. */
export const CORREO_POR_DEFECTO: ReadonlySet<string> = new Set(
  EVENTOS_NOTIF.filter((e) => e.correoPorDefecto).map((e) => e.clave),
)

/**
 * ¿Este evento manda correo?
 *
 * Un evento que no está en el catálogo no manda: los avisos sin catalogar son
 * siempre internos, y el correo debe ser una decisión explícita.
 */
export function mandaCorreo(evento: string | undefined, preferencias: Record<string, boolean>): boolean {
  if (!evento) return false
  const guardada = preferencias[evento]
  return guardada ?? CORREO_POR_DEFECTO.has(evento)
}

const CLAVES = new Set<string>(EVENTOS_NOTIF.map((e) => e.clave))

/** ¿La clave existe en el catálogo? Valida lo que llega de la pantalla de Ajustes. */
export function esEventoValido(clave: string): clave is ClaveEvento {
  return CLAVES.has(clave)
}
