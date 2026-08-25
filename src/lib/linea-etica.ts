/**
 * Tipos de reporte de la línea ética.
 *
 * Se separan porque no todos siguen el mismo camino: los dos de acoso van al
 * Comité de Convivencia Laboral con el procedimiento y los plazos de la Ley 1010
 * de 2006, mientras que una irregularidad o una sugerencia se atienden sin ese
 * trámite. Antes todo entraba como denuncia de acoso, así que una sugerencia
 * sobre el parqueadero le llegaba al Comité como un caso de ley.
 *
 * Módulo puro: lo usan la pantalla del colaborador, la bandeja de Jurídica y la
 * Server Action.
 */
export const TIPOS_REPORTE = [
  {
    valor: 'ACOSO_LABORAL',
    etiqueta: 'Acoso laboral',
    ayuda: 'Maltrato, persecución, discriminación o humillación en el trabajo.',
    esAcoso: true,
  },
  {
    valor: 'ACOSO_SEXUAL',
    etiqueta: 'Acoso sexual',
    ayuda: 'Insinuaciones, comentarios o conductas de contenido sexual no consentidas.',
    esAcoso: true,
  },
  {
    valor: 'CONDUCTA_IRREGULAR',
    etiqueta: 'Conducta indebida o irregularidad',
    ayuda: 'Robos, fraude, favoritismos, incumplimiento de normas o riesgos que nadie atiende.',
    esAcoso: false,
  },
  {
    valor: 'SUGERENCIA',
    etiqueta: 'Sugerencia o queja',
    ayuda: 'Algo que se puede mejorar, o una inconformidad que quieres que se sepa.',
    esAcoso: false,
  },
] as const

export type TipoReporte = (typeof TIPOS_REPORTE)[number]['valor']

const POR_VALOR = new Map(TIPOS_REPORTE.map((t) => [t.valor as string, t]))

export function etiquetaReporte(tipo: string): string {
  return POR_VALOR.get(tipo)?.etiqueta ?? tipo
}

/** Los de acoso siguen el procedimiento del Comité de Convivencia (Ley 1010). */
export function esAcoso(tipo: string): boolean {
  return POR_VALOR.get(tipo)?.esAcoso ?? false
}
