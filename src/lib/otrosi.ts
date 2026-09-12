import { fmtCOP } from '@/lib/moneda'
import { formatFechaCorta, parseFechaISO } from '@/lib/fechas'
import { MODALIDAD_TRABAJO } from '@/lib/etiquetas'

/**
 * Otrosí de contrato laboral: lo que se puede cambiar y cómo se cuenta.
 *
 * Un otrosí ya no lleva descripción libre. Lo que cambia queda en los tipos y en
 * `valoresNuevos`, y de ahí sale el resumen que ven Talento Humano y el
 * trabajador. Así el registro dice lo mismo que el PDF firmado, sin depender de
 * que alguien lo redacte a mano.
 */

export const TIPOS_CAMBIO_OTROSI = [
  'SALARIO', 'CARGO', 'SEDE', 'MODALIDAD_TRABAJO', 'JORNADA', 'FUNCIONES', 'DURACION', 'OTRO',
] as const
export type TipoCambioOtrosi = (typeof TIPOS_CAMBIO_OTROSI)[number]

export const ETIQUETA_CAMBIO_OTROSI: Record<TipoCambioOtrosi, string> = {
  SALARIO: 'Salario',
  CARGO: 'Cargo',
  SEDE: 'Sede',
  MODALIDAD_TRABAJO: 'Modalidad',
  JORNADA: 'Jornada',
  FUNCIONES: 'Funciones',
  DURACION: 'Duración',
  OTRO: 'Otro',
}

/**
 * Lo que queda en `OtrosiContrato.valoresNuevos` (y en `valoresAnteriores`).
 * Cargo y sede se guardan por NOMBRE, no por id: el resumen se lee sin consultar
 * nada y sigue diciendo lo mismo aunque el cargo se renombre después.
 * Las fechas van en ISO (AAAA-MM-DD), como toda fecha de negocio.
 */
export type ValoresOtrosi = {
  salario?: number
  cargo?: string
  sede?: string
  modalidad?: string
  fechaInicio?: string
  fechaFin?: string
}

function fechaCorta(iso: string | undefined): string {
  return iso ? formatFechaCorta(parseFechaISO(iso)) : ''
}

/**
 * Resumen legible de un otrosí a partir de sus cambios, p. ej.
 * "Duración: 01/10/2026 al 31/12/2026 · Salario: $ 3.000.000 · Funciones".
 * Un tipo sin valor registrado (Jornada, Funciones, Otro) se nombra a secas.
 */
export function resumenOtrosi(tipos: readonly string[], nuevos: ValoresOtrosi | null | undefined): string {
  const v = nuevos ?? {}
  const partes: string[] = []
  for (const t of tipos) {
    const etiqueta = ETIQUETA_CAMBIO_OTROSI[t as TipoCambioOtrosi] ?? t
    let valor = ''
    switch (t) {
      case 'SALARIO': valor = v.salario != null ? fmtCOP(v.salario) : ''; break
      case 'CARGO': valor = v.cargo ?? ''; break
      case 'SEDE': valor = v.sede ?? ''; break
      case 'MODALIDAD_TRABAJO': valor = v.modalidad ? (MODALIDAD_TRABAJO[v.modalidad] ?? v.modalidad) : ''; break
      case 'DURACION': {
        const ini = fechaCorta(v.fechaInicio)
        const fin = fechaCorta(v.fechaFin)
        valor = ini && fin ? `${ini} al ${fin}` : fin ? `hasta el ${fin}` : ''
        break
      }
    }
    partes.push(valor ? `${etiqueta}: ${valor}` : etiqueta)
  }
  return partes.join(' · ')
}
