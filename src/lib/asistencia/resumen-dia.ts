import { formatFechaLarga, parseFechaISO } from '@/lib/fechas'

/**
 * Texto del aviso "lo que AsistencIA te registró hoy". Puro: lo usa el
 * servidor para mandarlo y las pruebas para verificarlo.
 *
 * AsistencIA no expone por API las marcaciones de entrada y salida, solo los
 * tramos con recargo (GET /api/horas): por eso el resumen habla de horas extra
 * y recargos, y si hoy no generó ninguno, lo dice.
 */

export type TramoDia = { horaInicio: string; horaFin: string; tipoHora: string; horas: number }

const NOMBRE_TIPO: Record<string, string> = {
  HED: 'extra diurna', HEN: 'extra nocturna', HEDDF: 'dominical/festiva diurna', HENDF: 'dominical/festiva nocturna',
}

const horasTexto = (n: number) => `${n.toLocaleString('es-CO', { maximumFractionDigits: 2 })} h`

export function textoResumenDia(fechaISO: string, tramos: TramoDia[]): { titulo: string; mensaje: string } {
  const fecha = formatFechaLarga(parseFechaISO(fechaISO))
  const titulo = 'Tu registro de hoy en AsistencIA'
  if (tramos.length === 0) {
    return { titulo, mensaje: `Hoy, ${fecha}, no tienes horas extra ni recargos registrados en AsistencIA.` }
  }
  const orden = [...tramos].sort((a, b) => a.horaInicio.localeCompare(b.horaInicio))
  const partes = orden.map((t) => `${t.horaInicio}–${t.horaFin} ${NOMBRE_TIPO[t.tipoHora] ?? t.tipoHora} (${horasTexto(t.horas)})`)
  const total = orden.reduce((s, t) => s + t.horas, 0)
  return { titulo, mensaje: `Hoy, ${fecha}: ${partes.join(' · ')}. Total: ${horasTexto(total)}.` }
}

/** Jornada del día (lo que antes llegaba por correo desde AsistencIA). */
export type JornadaDia = {
  trabajado: { segundos: number }
  marcaciones: { tipo: 'entrada' | 'salida'; texto: string }[]
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** "8 h 05 min" desde segundos. */
function duracion(seg: number): string {
  const min = Math.round(seg / 60)
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`
}

/**
 * La notificación "tu jornada del día": solo las entradas y salidas (todas las
 * que haya) y el tiempo trabajado; nada más (decisión de empresa, 2026-09-25).
 * Reemplaza el correo diario: le llega al colaborador a su app (campana + push).
 */
export function textoJornadaDia(fechaISO: string, jornada: JornadaDia): { titulo: string; mensaje: string } {
  const d = new Date(`${fechaISO}T12:00:00Z`)
  const titulo = `Tu jornada del ${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`
  const marcas = jornada.marcaciones.map((m) => `${m.tipo === 'entrada' ? 'Entrada' : 'Salida'} ${m.texto}`)
  const mensaje = [
    marcas.length ? marcas.join(' · ') : 'Sin marcaciones',
    `Trabajaste ${duracion(jornada.trabajado.segundos)}`,
  ].join(' · ')
  return { titulo, mensaje }
}
