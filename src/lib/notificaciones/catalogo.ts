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
  | 'comprobante_permiso_requerido'
  | 'comprobante_permiso_entregado'
  | 'comprobante_permiso_revisado'
  | 'comprobante_permiso_vencido'
  | 'expediente_pendiente'
  // Bienestar
  | 'cumpleanos_encargado_asignado'
  | 'cumpleanos_recordatorio'
  | 'cumpleanos_facturas_entregadas'
  | 'cumpleanos_facturas_revisadas'
  // Contratos
  | 'contrato_pendiente_firma'
  | 'contrato_cerrado'
  | 'contrato_por_firmar'
  | 'contrato_firmado'
  | 'contrato_actualizado'
  | 'evaluacion_firmada'
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
  // Plataforma
  | 'aviso_publicado'

export type EventoNotif = {
  clave: ClaveEvento
  etiqueta: string
  descripcion: string
  modulo: string
  /**
   * Si además del aviso en la app se manda correo, mientras nadie lo cambie en
   * Ajustes. Hoy ningún evento lo trae en `true` (decisión del 2026-09-17): las
   * cuentas de muchas personas comparten un mismo buzón, así que un correo de
   * "tu permiso fue aprobado" lo leería medio equipo. Todo vive en la campana y
   * el push; por correo solo sale lo que no puede ir por otro lado (códigos de
   * firma, contraseñas, el aspirante sin cuenta). Se enciende evento por evento
   * en Ajustes → Notificaciones si algún día hace falta.
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
  { clave: 'comprobante_permiso_requerido', etiqueta: 'Comprobante de permiso requerido', descripcion: 'Al aprobar o registrar un permiso se le pide al colaborador el comprobante de asistencia, con su fecha límite.', modulo: 'Autoservicio' },
  { clave: 'comprobante_permiso_entregado', etiqueta: 'Comprobante de permiso entregado', descripcion: 'El colaborador sube el comprobante de asistencia y Talento Humano debe verificarlo.', modulo: 'Autoservicio' },
  { clave: 'comprobante_permiso_revisado', etiqueta: 'Comprobante de permiso revisado', descripcion: 'Talento Humano acepta el comprobante o lo devuelve para que el colaborador suba otro.', modulo: 'Autoservicio' },
  { clave: 'comprobante_permiso_vencido', etiqueta: 'Comprobante de permiso sin entregar', descripcion: 'Aviso automático a Talento Humano cuando venció el plazo y el colaborador no subió el comprobante.', modulo: 'Autoservicio' },
  // Sin correo: sale en el mismo momento que el del contrato, y dos correos a la
  // vez hacen que se ignore el que importa (la firma). Lo que falta se ve en la
  // campana y en Mis documentos.
  { clave: 'expediente_pendiente', etiqueta: 'Documentos del expediente pendientes', descripcion: 'Al quedar con contrato de trabajo se le dice al colaborador qué documentos le faltan por entregar.', modulo: 'Autoservicio' },

  // Bienestar
  { clave: 'cumpleanos_encargado_asignado', etiqueta: 'Cumpleaños a cargo', descripcion: 'Talento Humano le encarga a un colaborador la celebración del cumpleaños de otro.', modulo: 'Bienestar' },
  { clave: 'cumpleanos_recordatorio', etiqueta: 'Recordatorio de cumpleaños', descripcion: 'Aviso automático al encargado unos días antes del cumpleaños que tiene a cargo.', modulo: 'Bienestar' },
  { clave: 'cumpleanos_facturas_entregadas', etiqueta: 'Facturas de cumpleaños entregadas', descripcion: 'El encargado sube las facturas de la celebración y Talento Humano debe revisarlas.', modulo: 'Bienestar' },
  { clave: 'cumpleanos_facturas_revisadas', etiqueta: 'Facturas de cumpleaños revisadas', descripcion: 'Talento Humano acepta las facturas o las devuelve para que el encargado las corrija.', modulo: 'Bienestar' },

  // Contratos
  { clave: 'contrato_pendiente_firma', etiqueta: 'Contrato pendiente de firma', descripcion: 'Se crea un contrato que el colaborador debe firmar.', modulo: 'Contratos' },
  { clave: 'contrato_cerrado', etiqueta: 'Contrato OPS cerrado', descripcion: 'Talento Humano cierra un contrato de prestación de servicios (vencimiento del plazo, anticipado o mutuo acuerdo).', modulo: 'Contratos' },
  { clave: 'contrato_por_firmar', etiqueta: 'Falta tu firma en el contrato', descripcion: 'Una parte firmó y falta la otra.', modulo: 'Contratos' },
  { clave: 'contrato_firmado', etiqueta: 'Contrato firmado', descripcion: 'Se completan las firmas del contrato.', modulo: 'Contratos' },
  { clave: 'contrato_actualizado', etiqueta: 'Contrato actualizado', descripcion: 'Se modifica un contrato ya existente.', modulo: 'Contratos' },
  { clave: 'evaluacion_firmada', etiqueta: 'Acuerdo de evaluación firmado', descripcion: 'El aspirante devuelve firmado el acuerdo de evaluación previa: hay que evaluarlo y decidir.', modulo: 'Contratos' },

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
  { clave: 'denuncia_acoso', etiqueta: 'Reporte de la línea ética', descripcion: 'Llega un reporte por la línea ética (acoso, irregularidad o sugerencia).', modulo: 'Jurídica' },
  { clave: 'habeas_data', etiqueta: 'Consulta / reclamo de habeas data', descripcion: 'Un colaborador presenta una consulta o reclamo (Ley 1581): corre plazo de 10 o 15 días hábiles.', modulo: 'Jurídica' },
  { clave: 'llamado_atencion', etiqueta: 'Llamado de atención', descripcion: 'Se registra un llamado de atención.', modulo: 'Jurídica' },
  { clave: 'disciplinario_citacion', etiqueta: 'Citación a descargos', descripcion: 'Se cita al colaborador a descargos: corre el plazo de 5 días hábiles de su derecho de defensa.', modulo: 'Jurídica' },
  { clave: 'disciplinario_descargos', etiqueta: 'Descargos presentados', descripcion: 'El colaborador presenta sus descargos.', modulo: 'Jurídica' },
  { clave: 'disciplinario_avance', etiqueta: 'Avance de proceso disciplinario', descripcion: 'El proceso disciplinario cambia de etapa.', modulo: 'Jurídica' },
  { clave: 'disciplinario_decision', etiqueta: 'Decisión del proceso', descripcion: 'Se toma una decisión: corre el plazo de 5 días hábiles para apelar.', modulo: 'Jurídica' },
  { clave: 'disciplinario_apelacion', etiqueta: 'Recurso de apelación', descripcion: 'El colaborador presenta un recurso de apelación.', modulo: 'Jurídica' },
  { clave: 'disciplinario_cerrado', etiqueta: 'Proceso disciplinario cerrado', descripcion: 'Se cierra el proceso disciplinario.', modulo: 'Jurídica' },

  // Vencimientos / automáticas (incluye alertas de documentos y de obligaciones del calendario legal)
  { clave: 'vencimiento_alerta', etiqueta: 'Alerta de vencimiento', descripcion: 'Aviso automático de un vencimiento u obligación legal próxima (10 días hábiles antes y última alerta).', modulo: 'Vencimientos' },
  // Plataforma
  { clave: 'aviso_publicado', etiqueta: 'Aviso de la plataforma', descripcion: 'Talento Humano o el administrador publican un aviso: un módulo nuevo, una mejora o un cambio importante.', modulo: 'Plataforma' },
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
