import 'server-only'
import { prisma } from '@/lib/db'

/**
 * Cliente de la API de AsistencIA (ArriveControl), el sistema de control de
 * asistencia. Es la ÚNICA puerta por la que esta plataforma le habla: leer las
 * horas extra de un período y anotar cuáles ya se pagaron.
 *
 * La conexión es una clave de API por empresa: el administrador la copia de
 * AsistencIA (Ajustes → Mi empresa → Clave de API) y la pega aquí, en
 * Nómina → Novedades → Horas extra. Va en cada petición como `X-API-Key`; no hay
 * login ni token que renovar, y solo deja de servir si allá la regeneran (401).
 *
 * La cédula es la llave de cruce: en todo lo que devuelve, `documento` es la
 * cédula sin puntos ni espacios. Nombre y sede vienen solo de referencia.
 */

export const ASISTENCIA_URL_DEFECTO = 'https://arrivecontrol.vercel.app'

/** Los cuatro códigos que emite AsistencIA, en el orden en que los muestra. */
export const CODIGOS_ASISTENCIA = ['HED', 'HEN', 'HEDDF', 'HENDF'] as const
export type CodigoAsistencia = (typeof CODIGOS_ASISTENCIA)[number]

/**
 * Cómo se llama en esta plataforma cada código de AsistencIA. Los dominicales o
 * festivos allá llevan el sufijo F; aquí son HEDD/HEND (mismo significado).
 */
export const TIPO_HORA_DESDE_ASISTENCIA: Record<string, string> = {
  HED: 'HED', HEN: 'HEN', HEDDF: 'HEDD', HENDF: 'HEND',
}

/** Un tramo de horas con recargo, tal como lo entrega GET /api/horas. */
export type TramoAsistencia = {
  documento: string
  nombre?: string | null
  sede?: string | null
  fecha: string // YYYY-MM-DD (día Bogotá)
  horaInicio: string // HH:MM
  horaFin: string // HH:MM
  tipoHora: string // HED | HEN | HEDDF | HENDF
  horas: number // decimales: 1.5 = 1 h 30 min
  referenciaExterna: string // arrive-<cédula>-<fecha>-<inicio>-<fin>-<tipo>
  observaciones?: string
  factor?: number | null
  valor?: number | null // null si allá no tiene salario
  pagado?: boolean
}

/** Una persona en GET /api/horas/resumen. */
export type EmpleadoResumenAsistencia = {
  documento: string
  nombre: string | null
  sede: string | null
  horas: Record<string, number>
  horasExtra: number
  /** Pesos según el salario registrado ALLÁ; null si no lo tiene. */
  valor: number | null
  sinSalario: boolean
  referencias: string[]
  referenciasPendientes: string[]
  pago: 'pagado' | 'pendiente' | 'parcial'
}

export type ResumenAsistencia = {
  desde: string
  hasta: string
  totales: { empleados: number; horas: Record<string, number>; horasExtra: number; valor: number; valorPendiente: number; sinSalario: number }
  empleados: EmpleadoResumenAsistencia[]
}

/** Período de pago tal como lo entiende AsistencIA: mes y, opcional, quincena. */
export type PeriodoAsistencia = { mes: string; quincena?: 1 | 2 | null } | { desde: string; hasta: string }

export class ErrorAsistencia extends Error {
  constructor(
    mensaje: string,
    public readonly codigo: 'SIN_CLAVE' | 'CLAVE_INVALIDA' | 'NO_RESPONDE' | 'NO_EXISTE' | 'RECHAZADA',
  ) {
    super(mensaje)
  }
}

/** La cédula sin puntos, espacios ni guiones: así cruzan las dos plataformas. */
export function normalizarCedula(s: string | null | undefined): string {
  return String(s ?? '').replace(/[.\s-]/g, '')
}

/** Rango de un período de pago: quincena 1 = 1–15, quincena 2 = 16–fin de mes. */
export function rangoDePeriodo(mes: string, quincena: 1 | 2 | null | undefined): { desde: string; hasta: string } {
  const ultimo = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).getUTCDate()
  return {
    desde: `${mes}-${quincena === 2 ? '16' : '01'}`,
    hasta: `${mes}-${String(quincena === 1 ? 15 : ultimo).padStart(2, '0')}`,
  }
}

/**
 * La conexión configurada, o null si la empresa no tiene AsistencIA.
 *
 * Manda la clave guardada en la configuración de la empresa; la variable de
 * entorno queda como respaldo de las instalaciones que la configuraron así
 * antes de que existiera el ajuste.
 */
export async function conexionAsistencia(): Promise<{ url: string; clave: string } | null> {
  const c = await prisma.configuracionEmpresa.findFirst({ select: { asistenciaApiKey: true, asistenciaUrl: true } })
  const clave = c?.asistenciaApiKey?.trim() || process.env.ARRIVECONTROL_API_KEY?.trim() || ''
  if (!clave) return null
  const url = (c?.asistenciaUrl?.trim() || process.env.ARRIVECONTROL_URL?.trim() || ASISTENCIA_URL_DEFECTO).replace(/\/+$/, '')
  return { url, clave }
}

/** Enlace al panel de AsistencIA para revisar marcaciones a mano; null sin conexión. */
export async function urlPanelAsistencia(): Promise<string | null> {
  const con = await conexionAsistencia()
  return con ? `${con.url}/admin?tab=equipo` : null
}

function query(p: PeriodoAsistencia): string {
  if ('mes' in p) return `mes=${p.mes}${p.quincena ? `&quincena=${p.quincena}` : ''}`
  return `desde=${p.desde}&hasta=${p.hasta}`
}

/**
 * Una petición a AsistencIA con la clave de la empresa. Traduce cada fallo a
 * un mensaje que la persona pueda resolver: sin clave, clave regenerada allá,
 * servidor caído o petición rechazada.
 */
async function llamar<T>(ruta: string, init: RequestInit = {}, conexion?: { url: string; clave: string }): Promise<T> {
  const con = conexion ?? (await conexionAsistencia())
  if (!con) throw new ErrorAsistencia('AsistencIA no está conectada: falta la clave de API de la empresa.', 'SIN_CLAVE')

  let res: Response
  try {
    res = await fetch(`${con.url}${ruta}`, {
      ...init,
      headers: { 'X-API-Key': con.clave, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
      cache: 'no-store',
    })
  } catch (e) {
    throw new ErrorAsistencia(`AsistencIA no responde (${con.url}). Inténtalo de nuevo en un momento. Detalle: ${String(e)}`, 'NO_RESPONDE')
  }

  let datos: (T & { ok?: boolean; error?: string }) | null = null
  try {
    datos = (await res.json()) as T & { ok?: boolean; error?: string }
  } catch {
    throw new ErrorAsistencia(`AsistencIA respondió ${res.status} con algo que no es JSON.`, 'NO_RESPONDE')
  }
  if (res.status === 401) {
    throw new ErrorAsistencia('AsistencIA no reconoce esta clave de API. Revisa que la copiaste completa; si allá la regeneraron, pídela de nuevo en AsistencIA → Ajustes → Mi empresa.', 'CLAVE_INVALIDA')
  }
  if (res.status === 404) {
    throw new ErrorAsistencia(datos?.error ?? 'AsistencIA no encontró lo que se le pidió.', 'NO_EXISTE')
  }
  if (!res.ok || !datos?.ok) {
    throw new ErrorAsistencia(`AsistencIA rechazó la petición (${res.status}): ${datos?.error ?? 'sin detalle'}`, 'RECHAZADA')
  }
  return datos
}

/** Totales por persona de un período (lo mismo que la tabla de Reportes de AsistencIA). */
export async function resumenAsistencia(periodo: PeriodoAsistencia, conexion?: { url: string; clave: string }): Promise<ResumenAsistencia> {
  const r = await llamar<ResumenAsistencia>(`/api/horas/resumen?${query(periodo)}`, {}, conexion)
  return { desde: r.desde, hasta: r.hasta, totales: r.totales, empleados: r.empleados ?? [] }
}

/** Tramo a tramo: fecha, horas, tipo, referencia. Es lo que se registra como novedad. */
export async function tramosAsistencia(periodo: PeriodoAsistencia): Promise<TramoAsistencia[]> {
  const r = await llamar<{ registros: TramoAsistencia[] }>(`/api/horas?${query(periodo)}`)
  return r.registros ?? []
}

/**
 * Pone (o reemplaza) la foto de perfil de una persona en AsistencIA. Allá la
 * recortan al centro a 256×256; es solo la foto de las listas, no el rostro
 * del reconocimiento facial. 404 si la cédula no existe allá.
 */
export async function subirAvatar(cedula: string, imagen: Buffer, mime: 'image/jpeg' | 'image/png' | 'image/webp'): Promise<{ bytes: number }> {
  const r = await llamar<{ bytes: number }>(`/api/empleados/${normalizarCedula(cedula)}/avatar`, {
    method: 'PUT',
    body: JSON.stringify({ imagen: `data:${mime};base64,${imagen.toString('base64')}` }),
  })
  return { bytes: r.bytes ?? 0 }
}

/** Quita la foto de perfil en AsistencIA. */
export async function quitarAvatar(cedula: string): Promise<void> {
  await llamar<unknown>(`/api/empleados/${normalizarCedula(cedula)}/avatar`, { method: 'DELETE' })
}

/**
 * Anota en AsistencIA que esos tramos ya se pagaron (o deshace la anotación con
 * `pagado: false`). Es idempotente: repetirlo no duplica nada. AsistencIA no
 * mueve dinero; solo deja de mostrarlos como pendientes.
 */
export async function anotarPagadas(referencias: string[], pagado = true): Promise<{ afectados: number }> {
  const limpias = [...new Set(referencias.filter(Boolean))]
  if (limpias.length === 0) return { afectados: 0 }
  const r = await llamar<{ afectados: number }>('/api/horas/pagadas', {
    method: 'POST',
    body: JSON.stringify(pagado ? { referencias: limpias } : { referencias: limpias, pagado: false }),
  })
  return { afectados: r.afectados ?? 0 }
}
