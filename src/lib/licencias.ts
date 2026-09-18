export type TipoLicencia =

  | 'LUTO' | 'MATERNIDAD' | 'PATERNIDAD' | 'CALAMIDAD' | 'DIA_COMPENSATORIO_VOTACION'
  | 'MATRIMONIO' | 'ESTUDIO' | 'NO_REMUNERADA' | 'DIA_DE_LA_FAMILIA' | 'OTRA'

export type DefLicencia = {
  tipo: TipoLicencia
  label: string
  /** true = la ley la concede; no se aprueba, se registra y se valida el soporte. */
  derecho: boolean
  remunerada: boolean
  /** Norma básica o descripción corta para el colaborador. */
  fundamento: string
  /** Días que fija la ley. null = los fija el RIT o el caso. 0.5 = medio día. */
  diasLey: number | null
  requiereSoporte: boolean
  /** Qué soporte se espera. */
  soporteEsperado: string
}

export const LICENCIAS: DefLicencia[] = [
  {
    tipo: 'LUTO', label: 'Luto', derecho: true, remunerada: true,
    fundamento: 'Por fallecimiento de familiar hasta 2.° grado de consanguinidad, 1.° de afinidad o 1.° civil.',
    diasLey: 5, requiereSoporte: true,
    soporteEsperado: 'Registro civil de defunción (máximo 30 días después del hecho).',
  },
  {
    tipo: 'MATERNIDAD', label: 'Maternidad', derecho: true, remunerada: true,
    fundamento: 'Licencia por nacimiento o adopción. Pago asumido por la EPS.',
    diasLey: 126, requiereSoporte: true,
    soporteEsperado: 'Certificado médico de la EPS con fecha probable de parto o acta de adopción.',
  },
  {
    tipo: 'PATERNIDAD', label: 'Paternidad', derecho: true, remunerada: true,
    fundamento: 'Licencia para el padre por nacimiento o adopción. Pago asumido por la EPS.',
    diasLey: 14, requiereSoporte: true,
    soporteEsperado: 'Registro civil de nacimiento (máximo 30 días después del parto).',
  },
  {
    tipo: 'CALAMIDAD', label: 'Calamidad doméstica', derecho: true, remunerada: true,
    fundamento: 'Por emergencias familiares graves. La duración exacta se define según el RIT.',
    diasLey: null, requiereSoporte: true,
    soporteEsperado: 'Soporte físico, fotográfico o constancia que certifique la fuerza mayor.',
  },
  {
    tipo: 'DIA_COMPENSATORIO_VOTACION', label: 'Día compensatorio por votación', derecho: true, remunerada: true,
    fundamento: 'Medio día de descanso remunerado por ejercer el derecho al voto.',
    diasLey: 0.5, requiereSoporte: true,
    soporteEsperado: 'Certificado electoral de las últimas votaciones.',
  },
  {
    tipo: 'MATRIMONIO', label: 'Matrimonio', derecho: true, remunerada: true,
    fundamento: 'Derecho de ley por contraer matrimonio o declarar unión marital de hecho.',
    diasLey: 3, requiereSoporte: true,
    soporteEsperado: 'Registro civil de matrimonio o documento de unión de hecho.',
  },
  {
    tipo: 'DIA_DE_LA_FAMILIA', label: 'Día de la familia', derecho: true, remunerada: true,
    fundamento: 'Jornada obligatoria de ley para compartir con el núcleo familiar (una por semestre).',
    diasLey: 1, requiereSoporte: false,
    soporteEsperado: '—',
  },
  {
    tipo: 'ESTUDIO', label: 'Estudio o capacitaciones', derecho: false, remunerada: true,
    fundamento: 'Permiso condicionado al Reglamento Interno o acuerdo directo con el jefe.',
    diasLey: null, requiereSoporte: true,
    soporteEsperado: 'Horarios de clase, matrícula o constancia de asistencia escolar.',
  },
  {
    tipo: 'NO_REMUNERADA', label: 'Licencia no remunerada', derecho: false, remunerada: false,
    fundamento: 'Solicitud personal que suspende temporalmente el contrato y el pago del salario.',
    diasLey: null, requiereSoporte: false,
    soporteEsperado: '—',
  },
  {
    tipo: 'OTRA', label: 'Otra (Discrecional)', derecho: false, remunerada: true,
    fundamento: 'Permisos especiales aprobados bajo criterio exclusivo de la empresa.',
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

export function esDerecho(tipo: string): boolean {
  return defLicencia(tipo).derecho
}

