/**
 * Catálogo de licencias — única fuente de verdad para el autoservicio y el flujo
 * de aprobación.
 *
 * La distinción que importa es jurídica, no de interfaz: una licencia que la ley
 * concede como DERECHO no se "aprueba" (negarla es una falta del empleador), solo
 * se REGISTRA y Talento Humano valida el soporte. Una licencia DISCRECIONAL sí
 * depende de la voluntad del empleador y pasa por el jefe inmediato.
 *
 * Sin `server-only`: lo importan tanto el form cliente como las acciones server.
 */

export type TipoLicencia =
  | 'LUTO' | 'MATERNIDAD' | 'PATERNIDAD' | 'CALAMIDAD' | 'DIA_COMPENSATORIO_VOTACION'
  | 'MATRIMONIO' | 'ESTUDIO' | 'NO_REMUNERADA' | 'DIA_DE_LA_FAMILIA' | 'OTRA'

export type DefLicencia = {
  tipo: TipoLicencia
  label: string
  /** true = la ley la concede; no se aprueba, se registra y se valida el soporte. */
  derecho: boolean
  remunerada: boolean
  /** Norma que la sustenta, para mostrar al colaborador y al aprobador. */
  fundamento: string
  /** Días que fija la ley (guía para validar el soporte). null = los fija el RIT o el caso. */
  diasLey: number | null
  requiereSoporte: boolean
  /** Qué soporte se espera. */
  soporteEsperado: string
}

export const LICENCIAS: DefLicencia[] = [
  {
    tipo: 'LUTO', label: 'Luto', derecho: true, remunerada: true,
    fundamento: 'Ley 1280 de 2009 — 5 días hábiles remunerados por fallecimiento de familiar hasta 2.º grado de consanguinidad, 1.º de afinidad o 1.º civil.',
    diasLey: 5, requiereSoporte: true,
    soporteEsperado: 'Registro civil de defunción (puedes entregarlo dentro de los 30 días siguientes).',
  },
  {
    tipo: 'MATERNIDAD', label: 'Maternidad', derecho: true, remunerada: true,
    fundamento: 'Ley 1822 de 2017 — 18 semanas remuneradas. La paga la EPS.',
    diasLey: 126, requiereSoporte: true,
    soporteEsperado: 'Certificado médico de la EPS con la fecha probable de parto.',
  },
  {
    tipo: 'PATERNIDAD', label: 'Paternidad', derecho: true, remunerada: true,
    fundamento: 'Ley 2114 de 2021 — 2 semanas remuneradas. La paga la EPS.',
    diasLey: 14, requiereSoporte: true,
    soporteEsperado: 'Registro civil de nacimiento (dentro de los 30 días siguientes al parto).',
  },
  {
    tipo: 'CALAMIDAD', label: 'Calamidad doméstica', derecho: true, remunerada: true,
    fundamento: 'Art. 57 num. 6 CST — grave calamidad doméstica comprobada. La duración la fija el Reglamento Interno de Trabajo.',
    diasLey: null, requiereSoporte: true,
    soporteEsperado: 'Documento que acredite el hecho (constancia médica, denuncia, certificación, etc.).',
  },
  {
    tipo: 'DIA_COMPENSATORIO_VOTACION', label: 'Día compensatorio por votación', derecho: true, remunerada: true,
    fundamento: 'Ley 403 de 1997 y Ley 1163 de 2007 — medio día de descanso compensatorio remunerado, dentro del mes siguiente a la votación.',
    diasLey: 1, requiereSoporte: true,
    soporteEsperado: 'Certificado electoral.',
  },
  {
    tipo: 'MATRIMONIO', label: 'Matrimonio', derecho: false, remunerada: true,
    fundamento: 'No la concede la ley: depende del Reglamento Interno de Trabajo o de la decisión del empleador.',
    diasLey: null, requiereSoporte: false,
    soporteEsperado: 'Acta o registro de matrimonio (si te lo piden).',
  },
  {
    tipo: 'ESTUDIO', label: 'Estudio', derecho: false, remunerada: true,
    fundamento: 'Depende de la decisión del empleador o de lo pactado.',
    diasLey: null, requiereSoporte: false,
    soporteEsperado: 'Constancia de la institución educativa.',
  },
  {
    tipo: 'NO_REMUNERADA', label: 'No remunerada', derecho: false, remunerada: false,
    fundamento: 'Art. 51 CST — requiere acuerdo con el empleador; suspende el contrato y no se paga.',
    diasLey: null, requiereSoporte: false,
    soporteEsperado: '—',
  },
  {
    tipo: 'DIA_DE_LA_FAMILIA', label: 'Día de la familia', derecho: false, remunerada: true,
    fundamento: 'Ley 1857 de 2017 — la empresa debe facilitar una jornada semestral; la fecha se coordina con el jefe.',
    diasLey: 1, requiereSoporte: false,
    soporteEsperado: '—',
  },
  {
    tipo: 'OTRA', label: 'Otra', derecho: false, remunerada: true,
    fundamento: 'Se evalúa caso por caso.',
    diasLey: null, requiereSoporte: false,
    soporteEsperado: '—',
  },
]

export const TIPOS_LICENCIA = LICENCIAS.map((l) => l.tipo) as [TipoLicencia, ...TipoLicencia[]]

export function defLicencia(tipo: string): DefLicencia {
  const d = LICENCIAS.find((l) => l.tipo === tipo)
  if (!d) throw new Error(`Tipo de licencia desconocido: ${tipo}`)
  return d
}

/** Una licencia por derecho no se aprueba: Talento Humano la registra validando el soporte. */
export function esDerecho(tipo: string): boolean {
  return defLicencia(tipo).derecho
}
