/**
 * Textos cortos de una solicitud de autoservicio, compartidos por la bandeja de
 * aprobaciones, el historial y la ficha: qué tipo es, en qué estado va y "qué
 * pide" en una línea (fechas breves, horas, tipo de licencia…).
 */
import { defLicencia } from '@/lib/licencias'
import { fechaBreve, rangoBreve, dias as diasTexto } from '@/lib/notificaciones/texto'

export const TIPO_SOLICITUD: Record<string, string> = {
  VACACIONES: 'Vacaciones', PERMISO: 'Permiso', HORAS_EXTRA: 'Horas extra', INCAPACIDAD: 'Incapacidad', CERTIFICACION_LABORAL: 'Certificación', LICENCIA: 'Licencia',
}

export const ESTADO_SOLICITUD: Record<string, string> = {
  PENDIENTE: 'Pendiente', EN_APROBACION: 'En aprobación', EN_NEGOCIACION: 'Contrapropuesta', DEVUELTA: 'Devuelta',
  APROBADA: 'Aprobada', RECHAZADA: 'Rechazada', CANCELADA: 'Cancelada',
}

/** Tono de la píldora por estado: verde bien, ámbar en curso, rosa mal, neutro cerrado. */
export const TONO_SOLICITUD: Record<string, 'ok' | 'info' | 'warn' | 'bad' | 'muted' | 'accent'> = {
  APROBADA: 'ok', EN_APROBACION: 'warn', PENDIENTE: 'warn', DEVUELTA: 'warn', EN_NEGOCIACION: 'accent', RECHAZADA: 'bad', CANCELADA: 'muted',
}

const TIPO_INCAP: Record<string, string> = {
  ENFERMEDAD_GENERAL: 'Enfermedad general', ACCIDENTE_TRABAJO: 'Accidente de trabajo',
  ENFERMEDAD_LABORAL: 'Enfermedad laboral', LICENCIA_MATERNIDAD: 'Lic. maternidad', LICENCIA_PATERNIDAD: 'Lic. paternidad',
}
const TIPO_CERT: Record<string, string> = {
  SIMPLE: 'Simple', CON_SALARIO: 'Con salario', CON_FUNCIONES: 'Con funciones', ENTIDAD_FINANCIERA: 'Para entidad financiera',
}

/** Una línea con lo que se pide: fechas cortas, horas, tipo. El motivo va aparte. */
export function cuandoSolicitud(tipo: string, datos: Record<string, string>, diasHabiles: number | null = null): string {
  if (tipo === 'VACACIONES') return `${rangoBreve(datos.fechaInicio, datos.fechaFin)}${diasHabiles ? ` · ${diasTexto(diasHabiles, true)}` : ''}`
  if (tipo === 'PERMISO') {
    return datos.permisoTipo === 'HORAS' && datos.horaInicio
      ? `${fechaBreve(datos.fechaInicio)} · ${datos.horaInicio}–${datos.horaFin}`
      : `${fechaBreve(datos.fechaInicio)} · día completo`
  }
  if (tipo === 'HORAS_EXTRA') {
    const horas = (datos as Record<string, unknown>).horas
    return `${fechaBreve(datos.fechaInicio)} · ${datos.horaInicio}–${datos.horaFin}${horas ? ` · ${horas} h` : ''}`
  }
  if (tipo === 'INCAPACIDAD') return `${TIPO_INCAP[datos.incapacidadTipo] ?? 'Incapacidad'} · ${rangoBreve(datos.fechaInicio, datos.fechaFin)}${datos.entidad ? ` · ${datos.entidad}` : ''}`
  if (tipo === 'CERTIFICACION_LABORAL') return `${TIPO_CERT[datos.tipoCertificacion] ?? 'Simple'}${datos.dirigidaA ? ` · para ${datos.dirigidaA}` : ''}`
  if (tipo === 'LICENCIA' && datos.licenciaTipo) {
    const def = defLicencia(datos.licenciaTipo)
    return `${def.label} · ${rangoBreve(datos.fechaInicio, datos.fechaFin)} · ${def.remunerada ? 'remunerada' : 'no remunerada'}`
  }
  return ''
}
