/** Etiquetas legibles en español para los enums del dominio. */

export const TIPO_VINCULO: Record<string, string> = {
  TERMINO_INDEFINIDO: 'Término indefinido',
  TERMINO_FIJO: 'Término fijo',
  OBRA_LABOR: 'Obra o labor',
  APRENDIZ_SENA: 'Aprendiz SENA',
  OPS: 'Prestación de servicios (OPS)',
  PRACTICANTE: 'Practicante',
}

export const TIPO_VINCULO_CORTO: Record<string, string> = {
  TERMINO_INDEFINIDO: 'Indefinido',
  TERMINO_FIJO: 'Fijo',
  OBRA_LABOR: 'Obra/labor',
  APRENDIZ_SENA: 'Aprendiz',
  OPS: 'OPS',
  PRACTICANTE: 'Practicante',
}

export const MODALIDAD_TRABAJO: Record<string, string> = {
  PRESENCIAL: 'Presencial',
  REMOTO: 'Remoto',
  HIBRIDO: 'Híbrido',
  TELETRABAJO: 'Teletrabajo',
}

export const TIPO_DOCUMENTO_IDENTIDAD: Record<string, string> = {
  CC: 'Cédula de ciudadanía',
  CE: 'Cédula de extranjería',
  TI: 'Tarjeta de identidad',
  PASAPORTE: 'Pasaporte',
  PPT: 'Permiso por Protección Temporal',
  NIT: 'NIT',
}

export const GENERO: Record<string, string> = {
  MASCULINO: 'Masculino',
  FEMENINO: 'Femenino',
  OTRO: 'Otro',
  PREFIERE_NO_DECIR: 'Prefiere no decir',
}

export const ESTADO_CIVIL: Record<string, string> = {
  SOLTERO: 'Soltero(a)',
  CASADO: 'Casado(a)',
  UNION_LIBRE: 'Unión libre',
  SEPARADO: 'Separado(a)',
  DIVORCIADO: 'Divorciado(a)',
  VIUDO: 'Viudo(a)',
}

export const GRUPO_SANGUINEO: Record<string, string> = {
  A_POS: 'A+', A_NEG: 'A−', B_POS: 'B+', B_NEG: 'B−',
  AB_POS: 'AB+', AB_NEG: 'AB−', O_POS: 'O+', O_NEG: 'O−',
}

export const NIVEL_EDUCATIVO: Record<string, string> = {
  PRIMARIA: 'Primaria',
  BACHILLER: 'Bachiller',
  TECNICO: 'Técnico',
  TECNOLOGO: 'Tecnólogo',
  PREGRADO: 'Pregrado',
  ESPECIALIZACION: 'Especialización',
  MAESTRIA: 'Maestría',
  DOCTORADO: 'Doctorado',
}

export const TIPO_CUENTA: Record<string, string> = {
  AHORROS: 'Ahorros',
  CORRIENTE: 'Corriente',
  BILLETERA_DIGITAL: 'Billetera digital',
}

export const ESTADO_COLABORADOR: Record<string, string> = {
  ACTIVO: 'Activo',
  INACTIVO: 'Inactivo',
  RETIRADO: 'Retirado',
}

export const CLASE_RIESGO_ARL: Record<string, string> = {
  I: 'I (riesgo mínimo)',
  II: 'II (riesgo bajo)',
  III: 'III (riesgo medio)',
  IV: 'IV (riesgo alto)',
  V: 'V (riesgo máximo)',
}

export function nombreCompleto(c: { nombres: string; apellidos: string }): string {
  return `${c.nombres} ${c.apellidos}`.trim()
}

export function iniciales(nombres: string, apellidos: string): string {
  return `${nombres[0] ?? ''}${apellidos[0] ?? ''}`.toUpperCase()
}
