import { z } from 'zod'

export const ciudadSchema = z.object({
  nombre: z.string().trim().min(2, 'Mínimo 2 caracteres').max(80),
  departamento: z.string().trim().min(2, 'Indica el departamento').max(80),
  codigoDane: z.string().trim().max(10).optional().or(z.literal('')),
})
export type CiudadInput = z.infer<typeof ciudadSchema>

export const sedeSchema = z.object({
  nombre: z.string().trim().min(2, 'Mínimo 2 caracteres').max(100),
  ciudadId: z.uuid('Selecciona una ciudad'),
  direccion: z.string().trim().min(3, 'Indica la dirección').max(200),
  telefono: z.string().trim().max(40).optional().or(z.literal('')),
  esPrincipal: z.boolean(),
  activa: z.boolean(),
})
export type SedeInput = z.infer<typeof sedeSchema>

export const areaSchema = z.object({
  nombre: z.string().trim().min(2, 'Mínimo 2 caracteres').max(100),
  // Área de la que depende (organigrama). Vacío = área de primer nivel.
  padreId: z.union([z.uuid(), z.literal('')]).optional(),
  // Colaborador que responde por el área. Puede serlo de varias a la vez.
  responsableId: z.union([z.uuid(), z.literal('')]).optional(),
  activa: z.boolean(),
})
export type AreaInput = z.infer<typeof areaSchema>

export const tipoDocumentoSchema = z.object({
  nombre: z.string().trim().min(2, 'Mínimo 2 caracteres').max(120),
  descripcion: z.string().trim().max(300).optional().or(z.literal('')),
  requiereVencimiento: z.boolean(),
  nivelAcceso: z.enum(['GENERAL', 'RRHH', 'SST_MEDICO', 'JURIDICA', 'ADMIN']),
  // Override de los días de alerta; vacío = usa la regla global del tipo.
  diasPrimeraAlerta: z.number().int().min(1).max(365).nullable().optional(),
  diasUltimaAlerta: z.number().int().min(1).max(365).nullable().optional(),
  activo: z.boolean(),
  // Vínculos para los que este documento es obligatorio.
  vinculosObligatorios: z.array(
    z.enum(['TERMINO_INDEFINIDO', 'TERMINO_FIJO', 'OBRA_LABOR', 'APRENDIZ_SENA', 'OPS']),
  ),
})
export type TipoDocumentoInput = z.infer<typeof tipoDocumentoSchema>

export const cargoSchema = z.object({
  nombre: z.string().trim().min(2, 'Mínimo 2 caracteres').max(120),
  areaId: z.uuid('Selecciona un área'),
  nivel: z.enum(['directivo', 'coordinacion', 'operativo']).optional().or(z.literal('')),
  funciones: z.string().trim().max(2000).optional().or(z.literal('')),
  // Funciones para el contrato, en grupos con viñetas (cláusula de funciones).
  funcionesContrato: z.array(z.object({ grupo: z.string().trim().min(1).max(160), items: z.array(z.string().trim().min(1).max(600)) })).optional(),
  claseRiesgoDefecto: z.enum(['I', 'II', 'III', 'IV', 'V']).optional().or(z.literal('')),
  rolDefectoId: z.union([z.uuid(), z.literal('')]).optional(),
  activo: z.boolean(),
})
export type CargoInput = z.infer<typeof cargoSchema>

export const TIPOS_ENTIDAD_SS = ['EPS', 'ARL', 'AFP', 'FONDO_CESANTIAS', 'CAJA_COMPENSACION'] as const

export const entidadSSSchema = z.object({
  tipo: z.enum(TIPOS_ENTIDAD_SS),
  nombre: z.string().trim().min(2, 'Mínimo 2 caracteres').max(120),
  // Código del operador en PILA (opcional; lo exige la planilla, no la ficha).
  codigo: z.string().trim().max(20).optional().or(z.literal('')),
  activa: z.boolean(),
})
export type EntidadSSInput = z.infer<typeof entidadSSSchema>

export const bancoSchema = z.object({
  nombre: z.string().trim().min(2, 'Mínimo 2 caracteres').max(120),
  codigoAch: z.string().trim().max(20).optional().or(z.literal('')),
  activo: z.boolean(),
})
export type BancoInput = z.infer<typeof bancoSchema>

export const empresaSchema = z.object({
  razonSocial: z.string().trim().min(2).max(150),
  nombreComercial: z.string().trim().min(2).max(150),
  nit: z.string().trim().min(5, 'Indica el NIT').max(30),
  representanteLegal: z.string().trim().min(3).max(150),
  representanteLegalCc: z.string().trim().max(40).optional().or(z.literal('')),
  emailContacto: z.email('Correo inválido').optional().or(z.literal('')),
  telefono: z.string().trim().max(40).optional().or(z.literal('')),
  direccion: z.string().trim().max(200).optional().or(z.literal('')),
  sitioWeb: z.string().trim().max(120).optional().or(z.literal('')),
  sabadoHabil: z.boolean(),
})
export type EmpresaInput = z.infer<typeof empresaSchema>
