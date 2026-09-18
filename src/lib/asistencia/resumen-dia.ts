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
