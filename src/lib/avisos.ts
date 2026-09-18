/**
 * Avisos de la plataforma: lo que no depende de la base ni de React —los
 * tipos, las etiquetas y la regla de a quién le toca cada aviso—, para poder
 * probarlo solo y usarlo igual en el servidor, la campana y las pantallas.
 */

export type VinculoAudiencia = 'LABORAL' | 'OPS'

/** A quién va un aviso. Listas vacías = sin restricción en ese eje. */
export type Audiencia = {
  roles?: string[]
  vinculos?: VinculoAudiencia[]
  sedeIds?: string[]
}

/** Lo que hay que saber de una persona para decidir si un aviso le toca. */
export type PerfilAudiencia = {
  roles: string[]
  /** null = no tiene ficha de colaborador (p. ej. un administrador). */
  vinculo: VinculoAudiencia | null
  sedeIds: string[]
}

export const TIPOS_AVISO = [
  { valor: 'NUEVO_MODULO', etiqueta: 'Nuevo módulo', tone: 'ok' },
  { valor: 'MEJORA', etiqueta: 'Mejora', tone: 'info' },
  { valor: 'CAMBIO', etiqueta: 'Cambio importante', tone: 'warn' },
] as const
export type TipoAviso = (typeof TIPOS_AVISO)[number]['valor']

export function etiquetaTipoAviso(tipo: string): string {
  return TIPOS_AVISO.find((t) => t.valor === tipo)?.etiqueta ?? tipo
}

export function tonoTipoAviso(tipo: string): 'ok' | 'info' | 'warn' {
  return TIPOS_AVISO.find((t) => t.valor === tipo)?.tone ?? 'info'
}

/** Normaliza lo que venga de la base (JSON libre) a una audiencia bien formada. */
export function audienciaDe(json: unknown): Required<Audiencia> {
  const a = (json && typeof json === 'object' ? json : {}) as Audiencia
  const lista = (x: unknown) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string' && v.length > 0) : [])
  return {
    roles: lista(a.roles),
    vinculos: lista(a.vinculos).filter((v): v is VinculoAudiencia => v === 'LABORAL' || v === 'OPS'),
    sedeIds: lista(a.sedeIds),
  }
}

/**
 * ¿Le toca este aviso a esta persona? Cada eje restringe solo si tiene valores;
 * los tres se cruzan (rol Y vínculo Y sede). Quien no tiene ficha no tiene
 * vínculo ni sede de colaborador, así que un aviso dirigido por vínculo o por
 * sede no le llega —salvo que pertenezca a la sede por su usuario.
 */
export function audienciaIncluye(audiencia: unknown, perfil: PerfilAudiencia): boolean {
  const a = audienciaDe(audiencia)
  if (a.roles.length && !perfil.roles.some((r) => a.roles.includes(r))) return false
  if (a.vinculos.length && (!perfil.vinculo || !a.vinculos.includes(perfil.vinculo))) return false
  if (a.sedeIds.length && !perfil.sedeIds.some((s) => a.sedeIds.includes(s))) return false
  return true
}

/** "Todos", o la lista de restricciones en palabras, para las listas de gestión. */
export function describirAudiencia(audiencia: unknown, nombresSede: Record<string, string> = {}): string {
  const a = audienciaDe(audiencia)
  const partes: string[] = []
  if (a.roles.length) partes.push(a.roles.join(', '))
  if (a.vinculos.length) partes.push(a.vinculos.map((v) => (v === 'OPS' ? 'contratistas OPS' : 'vínculo laboral')).join(' y '))
  if (a.sedeIds.length) partes.push(a.sedeIds.map((s) => nombresSede[s] ?? 'sede').join(', '))
  return partes.length ? partes.join(' · ') : 'Todos'
}

/**
 * El detalle es texto plano: una línea = un párrafo; "- " al inicio = viñeta.
 * Se convierte en bloques para pintarlo igual en la tarjeta y en el historial.
 */
export function bloquesDetalle(detalle: string | null | undefined): { tipo: 'parrafo' | 'lista'; lineas: string[] }[] {
  const bloques: { tipo: 'parrafo' | 'lista'; lineas: string[] }[] = []
  for (const cruda of (detalle ?? '').split(/\r?\n/)) {
    const linea = cruda.trim()
    if (!linea) continue
    if (/^[-•*]\s+/.test(linea)) {
      const item = linea.replace(/^[-•*]\s+/, '')
      const ultimo = bloques[bloques.length - 1]
      if (ultimo?.tipo === 'lista') ultimo.lineas.push(item)
      else bloques.push({ tipo: 'lista', lineas: [item] })
    } else {
      bloques.push({ tipo: 'parrafo', lineas: [linea] })
    }
  }
  return bloques
}
