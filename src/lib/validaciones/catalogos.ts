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

export const cargoSchema = z.object({
  nombre: z.string().trim().min(2, 'Mínimo 2 caracteres').max(120),
  areaId: z.uuid('Selecciona un área'),
  nivel: z.enum(['directivo', 'coordinacion', 'operativo']).optional().or(z.literal('')),
  funciones: z.string().trim().max(2000).optional().or(z.literal('')),
  claseRiesgoDefecto: z.enum(['I', 'II', 'III', 'IV', 'V']).optional().or(z.literal('')),
  activo: z.boolean(),
})
export type CargoInput = z.infer<typeof cargoSchema>

export const empresaSchema = z.object({
  razonSocial: z.string().trim().min(2).max(150),
  nombreComercial: z.string().trim().min(2).max(150),
  nit: z.string().trim().min(5, 'Indica el NIT').max(30),
  representanteLegal: z.string().trim().min(3).max(150),
  emailContacto: z.email('Correo inválido').optional().or(z.literal('')),
  telefono: z.string().trim().max(40).optional().or(z.literal('')),
  direccion: z.string().trim().max(200).optional().or(z.literal('')),
  sitioWeb: z.string().trim().max(120).optional().or(z.literal('')),
  sabadoHabil: z.boolean(),
})
export type EmpresaInput = z.infer<typeof empresaSchema>
