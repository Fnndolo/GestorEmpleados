/**
 * La "ruta" de un proceso disciplinario, al estilo del rastreo de un envío:
 * qué fases ya se cumplieron, en cuál va y cuáles faltan, y qué se actuó en
 * cada una. Es pura (sin base ni hooks) para que la usen el detalle de
 * Jurídica y el autoservicio.
 *
 * `etapa` en el proceso es la fase EN CURSO (lo que está por hacerse): estar
 * en DESCARGOS quiere decir que la citación ya se hizo y se espera al
 * colaborador. Por eso todo lo anterior a la fase actual cuenta como hecho.
 * Un llamado de atención se detiene tras los descargos: no tiene decisión
 * sancionatoria ni recurso, así que su ruta es más corta.
 */

export type ActuacionRuta = {
  id: string
  fecha: Date
  detalle: string | null
  soportes: { id: string; nombre: string; mimeType: string }[]
}

export type FaseRuta = {
  clave: string
  etiqueta: string
  estado: 'hecha' | 'actual' | 'pendiente'
  /** Fecha de la primera actuación de la fase (la última, para el cierre). */
  fecha: Date | null
  /** Lo que se actuó en esa fase, en orden: es lo que se despliega bajo el nodo. */
  actuaciones: ActuacionRuta[]
}

const ORDEN_PROCESO = ['CITACION_DESCARGOS', 'DESCARGOS', 'DECISION', 'RECURSO', 'CERRADO'] as const
const ORDEN_LLAMADO = ['CITACION_DESCARGOS', 'DESCARGOS', 'CERRADO'] as const

export const ETIQUETA_FASE: Record<string, string> = {
  CITACION_DESCARGOS: 'Citación',
  DESCARGOS: 'Descargos',
  DECISION: 'Decisión',
  RECURSO: 'Recurso',
  CERRADO: 'Cerrado',
}

export function rutaDisciplinaria(p: {
  clase: string
  etapa: string
  cerrado: boolean
  etapas: { id: string; etapa: string; fecha: Date; detalle: string | null; soportes?: ActuacionRuta['soportes'] }[]
}): FaseRuta[] {
  const orden: readonly string[] = p.clase === 'LLAMADO_ATENCION' ? ORDEN_LLAMADO : ORDEN_PROCESO
  const actual = p.cerrado ? orden.length : Math.max(0, orden.indexOf(p.etapa))
  return orden.map((clave, i) => {
    const actuaciones = p.etapas
      .filter((e) => e.etapa === clave)
      .map((e) => ({ id: e.id, fecha: e.fecha, detalle: e.detalle, soportes: e.soportes ?? [] }))
    return {
      clave,
      etiqueta: ETIQUETA_FASE[clave] ?? clave,
      estado: i < actual ? 'hecha' : i === actual ? 'actual' : 'pendiente',
      fecha: actuaciones[0]?.fecha ?? null,
      actuaciones,
    }
  })
}
