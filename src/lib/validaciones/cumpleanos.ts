import { z } from 'zod'

export const asignarEncargadoSchema = z.object({
  colaboradorId: z.uuid('Elige a quién se le celebra'),
  anio: z.coerce.number().int().min(2000).max(2100),
  encargadoId: z.uuid('Elige al encargado'),
  nota: z.string().trim().max(500).optional().or(z.literal('')),
})
export type AsignarEncargadoInput = z.infer<typeof asignarEncargadoSchema>

export const entregarFacturasSchema = z.object({
  id: z.uuid(),
  // Lo gastado en total; opcional porque a veces la factura ya lo dice todo.
  valorTotal: z.coerce.number().min(0).max(999_999_999).optional(),
})
export type EntregarFacturasInput = z.infer<typeof entregarFacturasSchema>

export const revisarFacturasSchema = z
  .object({
    id: z.uuid(),
    decision: z.enum(['ACEPTAR', 'DEVOLVER']),
    motivo: z.string().trim().max(500).optional().or(z.literal('')),
  })
  .superRefine((d, ctx) => {
    // Devolver sin decir por qué deja al encargado adivinando.
    if (d.decision === 'DEVOLVER' && !d.motivo) {
      ctx.addIssue({ code: 'custom', path: ['motivo'], message: 'Indica qué hay que corregir.' })
    }
  })
export type RevisarFacturasInput = z.infer<typeof revisarFacturasSchema>
