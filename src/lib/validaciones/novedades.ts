import { z } from 'zod'

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')

export const incapacidadSchema = z.object({
  colaboradorId: z.uuid(),
  tipo: z.enum(['ENFERMEDAD_GENERAL', 'ACCIDENTE_TRABAJO', 'ENFERMEDAD_LABORAL', 'LICENCIA_MATERNIDAD', 'LICENCIA_PATERNIDAD']),
  fechaInicio: fecha,
  fechaFin: fecha,
  diagnosticoCie10: z.string().trim().max(20).optional().or(z.literal('')),
  entidad: z.string().trim().max(80).optional().or(z.literal('')),
  esProrroga: z.boolean(),
  observaciones: z.string().trim().max(500).optional().or(z.literal('')),
})
export type IncapacidadInput = z.infer<typeof incapacidadSchema>

export const licenciaSchema = z.object({
  colaboradorId: z.uuid(),
  tipo: z.enum(['MATERNIDAD', 'PATERNIDAD', 'LUTO', 'CALAMIDAD', 'MATRIMONIO', 'ESTUDIO', 'NO_REMUNERADA', 'DIA_DE_LA_FAMILIA', 'DIA_COMPENSATORIO_VOTACION', 'OTRA']),
  fechaInicio: fecha,
  fechaFin: fecha,
  remunerada: z.boolean(),
  observaciones: z.string().trim().max(500).optional().or(z.literal('')),
})
export type LicenciaInput = z.infer<typeof licenciaSchema>

export const permisoSchema = z.object({
  colaboradorId: z.uuid(),
  fecha,
  horas: z.coerce.number().min(0).max(24).optional(),
  diaCompleto: z.boolean(),
  motivo: z.string().trim().min(3).max(300),
  remunerado: z.boolean(),
})
export type PermisoInput = z.infer<typeof permisoSchema>

export const vacacionesSchema = z.object({
  colaboradorId: z.uuid(),
  fechaInicio: fecha,
  fechaFin: fecha,
  observaciones: z.string().trim().max(500).optional().or(z.literal('')),
})
export type VacacionesInput = z.infer<typeof vacacionesSchema>

export const bonificacionSchema = z.object({
  colaboradorId: z.uuid(),
  concepto: z.string().trim().min(2).max(120),
  valor: z.coerce.number().min(0),
  constitutivoSalario: z.boolean(),
  observaciones: z.string().trim().max(500).optional().or(z.literal('')),
})
export type BonificacionInput = z.infer<typeof bonificacionSchema>
