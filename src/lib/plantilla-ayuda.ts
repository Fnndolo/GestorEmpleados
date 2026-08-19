/**
 * Variables que se pueden escribir en una plantilla de contrato, agrupadas para
 * mostrarlas junto al editor.
 *
 * Debe coincidir con las claves de `construirVariables` en contrato-variables.ts:
 * si una clave no existe, el token `{{...}}` se imprime tal cual en el PDF, que
 * es la forma más rápida de darse cuenta del error al ver la muestra.
 */
export const VARIABLES_PLANTILLA: { grupo: string; vars: { clave: string; ejemplo: string }[] }[] = [
  {
    grupo: 'Empresa',
    vars: [
      { clave: 'empresa_razon_social', ejemplo: 'KUPOCELL S.A.S.' },
      { clave: 'empresa_marca', ejemplo: 'Smart Gadgets' },
      { clave: 'empresa_nit', ejemplo: '901339881-7' },
      { clave: 'representante_legal', ejemplo: 'Michael Martínez López' },
      { clave: 'representante_legal_cc', ejemplo: '1.085.xxx.xxx' },
      { clave: 'ciudad', ejemplo: 'Pasto, Nariño' },
    ],
  },
  {
    grupo: 'La otra parte',
    vars: [
      { clave: 'contratista_nombre', ejemplo: 'nombre completo' },
      { clave: 'contratista_cc', ejemplo: 'número de documento' },
      { clave: 'contratista_cc_lugar', ejemplo: 'lugar de expedición' },
      { clave: 'contratista_direccion', ejemplo: 'dirección' },
      { clave: 'contratista_email', ejemplo: 'correo' },
      { clave: 'contratista_telefono', ejemplo: 'teléfono' },
      { clave: 'empleado_nombre', ejemplo: 'igual, para contratos laborales' },
      { clave: 'empleado_cc', ejemplo: 'documento (laboral)' },
    ],
  },
  {
    grupo: 'Concordancia de género',
    vars: [
      { clave: 'contratista_tratamiento', ejemplo: 'el señor / la señora' },
      { clave: 'contratista_identificada', ejemplo: 'identificado / identificada' },
      { clave: 'denominacion_contratista', ejemplo: 'EL CONTRATISTA / LA CONTRATISTA' },
      { clave: 'empleado_tratamiento', ejemplo: 'el señor / la señora' },
    ],
  },
  {
    grupo: 'Del contrato',
    vars: [
      { clave: 'numero', ejemplo: 'KC-001' },
      { clave: 'cargo_objeto', ejemplo: 'cargo u objeto contratado' },
      { clave: 'fecha_suscripcion_larga', ejemplo: 'fecha de firma en letras' },
      { clave: 'fecha_inicio_larga', ejemplo: 'fecha de inicio en letras' },
      { clave: 'fecha_fin_larga', ejemplo: 'fecha de fin en letras' },
      { clave: 'plazo_letras', ejemplo: 'tres (3) meses' },
    ],
  },
  {
    grupo: 'Dinero (en letras)',
    vars: [
      { clave: 'valor_total_mcte_letras', ejemplo: 'valor total del contrato' },
      { clave: 'honorario_mensual_letras', ejemplo: 'honorarios mensuales (OPS)' },
      { clave: 'salario_mcte_letras', ejemplo: 'salario mensual (laboral)' },
      { clave: 'aux_transporte_mcte_letras', ejemplo: 'auxilio de transporte' },
    ],
  },
]

/** Todas las claves válidas, para avisar de las que no existen. */
export const CLAVES_VALIDAS = new Set(VARIABLES_PLANTILLA.flatMap((g) => g.vars.map((v) => v.clave)))

/**
 * Variables escritas en el texto que no existen. Se imprimirían como `{{asi}}`
 * en el PDF, así que conviene avisar antes de guardar.
 */
export function variablesDesconocidas(texto: string): string[] {
  const usadas = [...texto.matchAll(/\{\{\s*([\w]+)\s*\}\}/g)].map((m) => m[1])
  return [...new Set(usadas.filter((v) => !CLAVES_VALIDAS.has(v)))]
}
