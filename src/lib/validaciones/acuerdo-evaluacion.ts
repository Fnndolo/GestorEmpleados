import { z } from 'zod'

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Indica una fecha válida')

/**
 * Acuerdo de evaluación previa SIN relación laboral. Los datos de la empresa
 * (razón social, NIT, representante legal, domicilio) NO se piden aquí: salen de
 * Configuración → Empresa, que es la fuente única.
 */
export const acuerdoEvaluacionSchema = z
  .object({
    nombres: z.string().trim().min(2, 'Indica los nombres').max(80),
    apellidos: z.string().trim().min(2, 'Indica los apellidos').max(80),
    tipoDocumento: z.enum(['CC', 'CE', 'TI', 'PASAPORTE', 'PPT', 'NIT']),
    numeroDocumento: z.string().trim().min(4, 'Documento inválido').max(20),
    lugarExpedicionDoc: z.string().trim().max(120).optional().or(z.literal('')),
    direccion: z.string().trim().max(200).optional().or(z.literal('')),
    // Obligatorio: por ahí se le envía el acuerdo para que lo firme y lo devuelva.
    email: z.email('Indica el correo — por ahí se le envía el acuerdo'),
    celular: z.string().trim().max(20).optional().or(z.literal('')),
    // Cargo a evaluar: se puede elegir del catálogo o escribir libre (un aspirante
    // puede evaluarse para un cargo que aún no existe en la estructura).
    cargoEvaluado: z.string().trim().min(2, 'Indica el cargo a evaluar').max(120),
    cargoId: z.union([z.uuid(), z.literal('')]).optional(),
    sedeId: z.union([z.uuid(), z.literal('')]).optional(),
    fechaInicio: fecha,
    fechaFin: fecha,
    ciudadFirma: z.string().trim().max(80).optional().or(z.literal('')),
    aniosConfidencialidad: z.number().int().min(1).max(10),
    observaciones: z.string().trim().max(500).optional().or(z.literal('')),
  })
  // La cláusula tercera fija un periodo cerrado, sin prórroga tácita: una fecha
  // de fin anterior al inicio haría un acuerdo imposible de cumplir.
  .refine((d) => d.fechaFin >= d.fechaInicio, {
    message: 'La fecha de fin no puede ser anterior a la de inicio',
    path: ['fechaFin'],
  })

export type AcuerdoEvaluacionInput = z.infer<typeof acuerdoEvaluacionSchema>

/** Resultado de la evaluación. Solo se decide una vez terminada. */
export const decisionAcuerdoSchema = z.object({
  id: z.uuid(),
  aprobado: z.boolean(),
  observaciones: z.string().trim().max(500).optional().or(z.literal('')),
})
export type DecisionAcuerdoInput = z.infer<typeof decisionAcuerdoSchema>

/** Carga del acuerdo ya firmado en físico (escaneado). */
export const subirAcuerdoFirmadoSchema = z.object({
  id: z.uuid(),
  pdfBase64: z
    .string()
    .min(1, 'Adjunta el PDF firmado')
    .startsWith('data:application/pdf', 'El archivo debe ser un PDF'),
})
export type SubirAcuerdoFirmadoInput = z.infer<typeof subirAcuerdoFirmadoSchema>
