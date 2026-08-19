import { z } from 'zod'

/**
 * Plantilla de contrato editable desde Ajustes: el texto legal vive en la base,
 * no en el código, para que Jurídica pueda corregir una cláusula sin depender de
 * un despliegue.
 */
/**
 * El tipo NO es "OPS o laboral": la plantilla se busca con el tipo exacto del
 * contrato (`where: { tipo: c.tipo }`), así que cada modalidad laboral necesita
 * la suya. Una plantilla con un tipo que no esté en esta lista no la encontraría
 * nadie y quedaría muerta.
 */
export const TIPOS_PLANTILLA = [
  'OPS',
  'TERMINO_FIJO',
  'TERMINO_INDEFINIDO',
  'OBRA_LABOR',
  'APRENDIZAJE_SENA',
  'PRACTICA',
] as const

export const ETIQUETA_TIPO_PLANTILLA: Record<(typeof TIPOS_PLANTILLA)[number], string> = {
  OPS: 'Prestación de servicios (OPS)',
  TERMINO_FIJO: 'Trabajo a término fijo',
  TERMINO_INDEFINIDO: 'Trabajo a término indefinido',
  OBRA_LABOR: 'Obra o labor',
  APRENDIZAJE_SENA: 'Aprendizaje SENA',
  PRACTICA: 'Práctica',
}

export const plantillaContratoSchema = z.object({
  nombre: z.string().trim().min(3, 'Ponle un nombre reconocible').max(120),
  tipo: z.enum(TIPOS_PLANTILLA),
  titulo: z.string().trim().min(5, 'El título encabeza el documento').max(200),
  intro: z.string().trim().min(10, 'El párrafo introductorio no puede ir vacío').max(4000),
  cierre: z.string().trim().max(2000).optional().or(z.literal('')),
  activa: z.boolean(),
  clausulas: z
    .array(
      z.object({
        titulo: z.string().trim().min(3, 'Cada cláusula necesita título').max(200),
        cuerpo: z.string().trim().min(5, 'La cláusula no puede ir vacía').max(8000),
      }),
    )
    .min(1, 'Un contrato necesita al menos una cláusula')
    .max(60),
})
export type PlantillaContratoInput = z.infer<typeof plantillaContratoSchema>
