/**
 * Cuenta de cobro: reglas puras compartidas por el PDF y la vista previa del
 * editor de plantillas (Ajustes → Plantillas de documentos → Cuenta de cobro).
 */

export type VarsCuentaCobro = {
  contratista: string
  documento: string
  /** Ya formateado en pesos ("$ 1.500.000"). */
  valor: string
  periodo: string
  concepto: string
  empresa: string
  nit: string
  ciudad: string
}

/** Variables que admite la plantilla, con su explicación. */
export const VARIABLES_CUENTA_COBRO: { clave: keyof VarsCuentaCobro; descripcion: string }[] = [
  { clave: 'contratista', descripcion: 'Nombre del contratista' },
  { clave: 'documento', descripcion: 'Tipo y número de documento' },
  { clave: 'valor', descripcion: 'Valor de la cuenta, en pesos' },
  { clave: 'periodo', descripcion: 'Periodo cobrado' },
  { clave: 'concepto', descripcion: 'Concepto de la cuenta' },
  { clave: 'empresa', descripcion: 'Razón social de la empresa' },
  { clave: 'nit', descripcion: 'NIT de la empresa' },
  { clave: 'ciudad', descripcion: 'Ciudad de la sede del contratista' },
]

/** Texto del cuerpo cuando no hay ninguna plantilla configurada. */
export const CUERPO_DEFECTO_CUENTA_COBRO =
  'Esta cuenta de cobro corresponde a los conceptos descritos. Declaro que la información es veraz.'

/** Reemplaza las {{variables}} conocidas (sin distinguir mayúsculas); las desconocidas se dejan tal cual. */
export function aplicarVariablesCuentaCobro(texto: string, v: VarsCuentaCobro): string {
  return texto.replace(/\{\{\s*(contratista|documento|valor|periodo|concepto|empresa|nit|ciudad)\s*\}\}/gi, (_, k: string) => {
    return v[k.toLowerCase() as keyof VarsCuentaCobro] ?? ''
  })
}

/** Datos ficticios (y se nota) para las muestras y la vista previa. */
export const MUESTRA_CUENTA_COBRO = {
  numero: 'MUESTRA-000',
  contratista: 'NOMBRE DE MUESTRA APELLIDO APELLIDO',
  documento: 'CC 1.000.000.000',
  valor: 1_500_000,
  periodo: 'Enero de 2026',
  concepto: 'Servicios de muestra · Enero de 2026',
  banco: 'Banco de muestra',
  tipoCuenta: 'cuenta de ahorros',
  numeroCuenta: '000-000000-00',
  ciudad: 'Ciudad de muestra',
} as const
