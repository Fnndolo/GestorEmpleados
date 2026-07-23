import { z } from 'zod'

const opcional = (max = 150) => z.string().trim().max(max).optional().or(z.literal(''))
const uuidOpcional = z.union([z.uuid(), z.literal('')]).optional()
// Fecha en formato yyyy-mm-dd (input date). Vacío permitido en opcionales.
const fechaOpcional = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')
  .optional()
  .or(z.literal(''))
const fechaRequerida = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Indica una fecha válida')

export const colaboradorSchema = z.object({
  // Identificación
  tipoDocumento: z.enum(['CC', 'CE', 'TI', 'PASAPORTE', 'PPT', 'NIT']),
  numeroDocumento: z.string().trim().min(4, 'Documento inválido').max(20),
  fechaExpedicionDoc: fechaOpcional,
  lugarExpedicionDoc: opcional(),
  nombres: z.string().trim().min(2, 'Indica los nombres').max(80),
  apellidos: z.string().trim().min(2, 'Indica los apellidos').max(80),
  fechaNacimiento: fechaOpcional,
  lugarNacimiento: opcional(),
  genero: z.enum(['MASCULINO', 'FEMENINO', 'OTRO', 'PREFIERE_NO_DECIR']).optional().or(z.literal('')),
  estadoCivil: z.enum(['SOLTERO', 'CASADO', 'UNION_LIBRE', 'SEPARADO', 'DIVORCIADO', 'VIUDO']).optional().or(z.literal('')),
  grupoSanguineo: z.enum(['A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'AB_POS', 'AB_NEG', 'O_POS', 'O_NEG']).optional().or(z.literal('')),
  // Contacto
  direccion: opcional(200),
  barrio: opcional(),
  ciudadResidenciaId: uuidOpcional,
  celular: z.string().trim().min(7, 'Indica el celular').max(20),
  telefono: opcional(20),
  // Obligatorio: es el canal por el que llegan las credenciales de acceso
  // (invitación con contraseña temporal) y las notificaciones.
  emailPersonal: z.email('Indica el correo personal — ahí llegan sus credenciales de acceso'),
  emailCorporativo: z.union([z.email('Correo inválido'), z.literal('')]).optional(),
  // Emergencia
  emergenciaNombre: opcional(),
  emergenciaParentesco: opcional(60),
  emergenciaTelefono: opcional(20),
  // Educación
  nivelEducativoMax: z.enum(['PRIMARIA', 'BACHILLER', 'TECNICO', 'TECNOLOGO', 'PREGRADO', 'ESPECIALIZACION', 'MAESTRIA', 'DOCTORADO']).optional().or(z.literal('')),
  // Salud / seguridad social
  epsId: uuidOpcional,
  afpId: uuidOpcional,
  fondoCesantiasId: uuidOpcional,
  cajaCompensacionId: uuidOpcional,
  arlId: uuidOpcional,
  claseRiesgoArl: z.enum(['I', 'II', 'III', 'IV', 'V']).optional().or(z.literal('')),
  // Bancarios
  bancoId: uuidOpcional,
  tipoCuenta: z.enum(['AHORROS', 'CORRIENTE', 'BILLETERA_DIGITAL']).optional().or(z.literal('')),
  numeroCuenta: opcional(30),
  // Organizacional
  tipoVinculo: z.enum(['TERMINO_INDEFINIDO', 'TERMINO_FIJO', 'OBRA_LABOR', 'APRENDIZ_SENA', 'OPS', 'PRACTICANTE']),
  sedeId: z.uuid('Selecciona una sede'),
  areaId: uuidOpcional,
  cargoId: uuidOpcional,
  jefeInmediatoId: uuidOpcional,
  modalidadTrabajo: z.enum(['PRESENCIAL', 'REMOTO', 'HIBRIDO', 'TELETRABAJO']),
  fechaIngreso: fechaRequerida,
  estado: z.enum(['ACTIVO', 'INACTIVO', 'RETIRADO']),
  // Dotación
  tallaCamisa: opcional(10),
  tallaPantalon: opcional(10),
  tallaCalzado: opcional(10),
})
export type ColaboradorInput = z.infer<typeof colaboradorSchema>

/**
 * Subconjunto de campos que el PROPIO colaborador puede completar/editar desde su
 * autoservicio. Excluye identidad (documento, nombres), correo de acceso y todo lo
 * organizacional/contractual (vínculo, sede, cargo, salario, estado, clase de riesgo),
 * que solo maneja Talento Humano.
 */
export const miFichaSchema = z.object({
  // Documento (fecha/lugar de expedición)
  fechaExpedicionDoc: fechaOpcional,
  lugarExpedicionDoc: opcional(),
  // Personales
  fechaNacimiento: fechaOpcional,
  lugarNacimiento: opcional(),
  genero: z.enum(['MASCULINO', 'FEMENINO', 'OTRO', 'PREFIERE_NO_DECIR']).optional().or(z.literal('')),
  estadoCivil: z.enum(['SOLTERO', 'CASADO', 'UNION_LIBRE', 'SEPARADO', 'DIVORCIADO', 'VIUDO']).optional().or(z.literal('')),
  grupoSanguineo: z.enum(['A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'AB_POS', 'AB_NEG', 'O_POS', 'O_NEG']).optional().or(z.literal('')),
  // Contacto
  direccion: opcional(200),
  barrio: opcional(),
  ciudadResidenciaId: uuidOpcional,
  telefono: opcional(20),
  // Emergencia
  emergenciaNombre: opcional(),
  emergenciaParentesco: opcional(60),
  emergenciaTelefono: opcional(20),
  // Educación
  nivelEducativoMax: z.enum(['PRIMARIA', 'BACHILLER', 'TECNICO', 'TECNOLOGO', 'PREGRADO', 'ESPECIALIZACION', 'MAESTRIA', 'DOCTORADO']).optional().or(z.literal('')),
  // Seguridad social (sus afiliaciones; NO la clase de riesgo, que la fija la empresa)
  epsId: uuidOpcional,
  afpId: uuidOpcional,
  fondoCesantiasId: uuidOpcional,
  cajaCompensacionId: uuidOpcional,
  arlId: uuidOpcional,
  // Bancarios (para el pago de nómina)
  bancoId: uuidOpcional,
  tipoCuenta: z.enum(['AHORROS', 'CORRIENTE', 'BILLETERA_DIGITAL']).optional().or(z.literal('')),
  numeroCuenta: opcional(30),
  // Dotación
  tallaCamisa: opcional(10),
  tallaPantalon: opcional(10),
  tallaCalzado: opcional(10),
})
export type MiFichaInput = z.infer<typeof miFichaSchema>

export const educacionSchema = z.object({
  colaboradorId: z.uuid(),
  nivel: z.enum(['PRIMARIA', 'BACHILLER', 'TECNICO', 'TECNOLOGO', 'PREGRADO', 'ESPECIALIZACION', 'MAESTRIA', 'DOCTORADO']),
  titulo: z.string().trim().min(2).max(120),
  institucion: z.string().trim().min(2).max(120),
  fechaGrado: fechaOpcional,
  enCurso: z.boolean(),
})
export type EducacionInput = z.infer<typeof educacionSchema>
