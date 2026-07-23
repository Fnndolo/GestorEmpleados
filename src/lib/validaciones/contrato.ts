import { z } from 'zod'

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')
const fechaOpc = fecha.optional().or(z.literal(''))
const uuidOpc = z.union([z.uuid(), z.literal('')]).optional()

export const contratoSchema = z.object({
  colaboradorId: z.uuid('Selecciona el colaborador'),
  tipo: z.enum(['TERMINO_FIJO', 'TERMINO_INDEFINIDO', 'OBRA_LABOR', 'APRENDIZAJE_SENA', 'PRACTICA']),
  cargoId: uuidOpc,
  sedeId: z.uuid('Selecciona la sede'),
  jornada: z.enum(['TIEMPO_COMPLETO', 'MEDIO_TIEMPO', 'POR_DIAS']),
  horasSemanales: z.coerce.number().int().min(1).max(60).optional(),
  modalidadTrabajo: z.enum(['PRESENCIAL', 'REMOTO', 'HIBRIDO', 'TELETRABAJO']),
  salarioBase: z.coerce.number().min(0),
  ganaSalarioMinimo: z.boolean().optional(),
  tieneAuxTransporte: z.boolean().optional(),
  auxConectividad: z.coerce.number().min(0).optional(),
  tipoSalario: z.enum(['ORDINARIO', 'INTEGRAL']),
  fechaInicio: fecha,
  fechaFin: fechaOpc,
  objetoObraLabor: z.string().trim().max(500).optional().or(z.literal('')),
  etapaAprendizaje: z.enum(['LECTIVA', 'PRODUCTIVA']).optional().or(z.literal('')),
  periodoPruebaDias: z.coerce.number().int().min(0).max(365).optional(),
  observaciones: z.string().trim().max(1000).optional().or(z.literal('')),
  // Texto del documento (editable por contrato; si no viene, se usa la plantilla de BD).
  plantillaTitulo: z.string().trim().max(200).optional().or(z.literal('')),
  plantillaIntro: z.string().max(6000).optional().or(z.literal('')),
  plantillaCierre: z.string().max(2000).optional().or(z.literal('')),
  clausulas: z.array(z.object({
    titulo: z.string().trim().max(220),
    cuerpo: z.string().max(8000),
    esFunciones: z.boolean().optional(),
  })).optional(),
  funciones: z.array(z.object({ grupo: z.string().trim().max(200), items: z.array(z.string().trim().max(600)) })).optional(),
  generarPdf: z.boolean().optional(),
})
export type ContratoInput = z.infer<typeof contratoSchema>

export const prorrogaSchema = z.object({
  contratoId: z.uuid(),
  fechaInicio: fecha,
  fechaFin: fecha,
  fechaFirma: fechaOpc,
})
export type ProrrogaInput = z.infer<typeof prorrogaSchema>

export const otrosiSchema = z.object({
  contratoId: z.uuid(),
  fecha: fecha,
  tiposCambio: z.array(z.enum(['SALARIO', 'CARGO', 'SEDE', 'MODALIDAD_TRABAJO', 'JORNADA', 'FUNCIONES', 'DURACION', 'OTRO'])).min(1, 'Indica al menos un cambio'),
  descripcion: z.string().trim().min(3).max(1000),
  salarioNuevo: z.coerce.number().min(0).optional(),
  cargoNuevoId: uuidOpc,
  sedeNuevaId: uuidOpc,
  modalidadNueva: z.enum(['PRESENCIAL', 'REMOTO', 'HIBRIDO', 'TELETRABAJO']).optional().or(z.literal('')),
  fechaFinNueva: fechaOpc,
})
export type OtrosiInput = z.infer<typeof otrosiSchema>

export const suspensionSchema = z.object({
  contratoId: z.uuid(),
  fechaInicio: fecha,
  fechaFin: fechaOpc,
  causa: z.enum(['SANCION_DISCIPLINARIA', 'LICENCIA_NO_REMUNERADA', 'FUERZA_MAYOR', 'OTRO']),
  descripcion: z.string().trim().max(500).optional().or(z.literal('')),
})
export type SuspensionInput = z.infer<typeof suspensionSchema>

export const contratoOpsSchema = z.object({
  colaboradorId: z.uuid('Selecciona el contratista'),
  objeto: z.string().trim().min(5, 'Describe el objeto del contrato').max(1000),
  valorTotal: z.coerce.number().min(0),
  valorMensual: z.coerce.number().min(0).optional(),
  supervisorId: uuidOpc,
  sedeId: z.uuid('Selecciona la sede'),
  fechaInicio: fecha,
  fechaFin: fecha,
  rut: z.string().trim().max(30).optional().or(z.literal('')),
  // Número del contrato (opcional; si va vacío se asigna uno automático).
  numero: z.string().trim().max(40).optional().or(z.literal('')),
  // Plantilla de contrato: cargo (funciones) + datos para el PDF.
  cargoId: uuidOpc,
  cargoObjeto: z.string().trim().max(200).optional().or(z.literal('')),
  ciudad: z.string().trim().max(80).optional().or(z.literal('')),
  fechaSuscripcion: fechaOpc,
  plazoMeses: z.coerce.number().int().min(0).max(120).optional(),
  // Snapshot del contratista para el documento (se prellenan desde el colaborador).
  contratistaNombre: z.string().trim().max(160).optional().or(z.literal('')),
  contratistaCc: z.string().trim().max(40).optional().or(z.literal('')),
  contratistaCcLugar: z.string().trim().max(80).optional().or(z.literal('')),
  contratistaDireccion: z.string().trim().max(200).optional().or(z.literal('')),
  contratistaEmail: z.string().trim().max(160).optional().or(z.literal('')),
  contratistaTelefono: z.string().trim().max(40).optional().or(z.literal('')),
  contratistaGenero: z.string().trim().max(20).optional().or(z.literal('')),
  // Datos de la empresa (con valores por defecto de la configuración, editables aquí).
  empresaRazonSocial: z.string().trim().max(160).optional().or(z.literal('')),
  empresaMarca: z.string().trim().max(160).optional().or(z.literal('')),
  empresaNit: z.string().trim().max(40).optional().or(z.literal('')),
  empresaRepLegal: z.string().trim().max(160).optional().or(z.literal('')),
  empresaRepLegalCc: z.string().trim().max(40).optional().or(z.literal('')),
  empresaCorreoDevolucion: z.string().trim().max(160).optional().or(z.literal('')),
  // Texto del documento (editable por contrato).
  plantillaTitulo: z.string().trim().max(200).optional().or(z.literal('')),
  plantillaIntro: z.string().max(4000).optional().or(z.literal('')),
  plantillaCierre: z.string().max(2000).optional().or(z.literal('')),
  clausulas: z.array(z.object({
    titulo: z.string().trim().max(220),
    cuerpo: z.string().max(6000),
    esFunciones: z.boolean().optional(),
  })).optional(),
  funciones: z.array(z.object({ grupo: z.string().trim().max(200), items: z.array(z.string().trim().max(600)) })).optional(),
  funcionesTexto: z.string().max(8000).optional().or(z.literal('')),
  // Entregables pactados (descripción + fecha de entrega opcional).
  entregables: z.array(z.object({
    descripcion: z.string().trim().min(3, 'Describe el entregable').max(500),
    fechaEntrega: fechaOpc,
  })).optional(),
  generarPdf: z.boolean().optional(),
})
export type ContratoOpsInput = z.infer<typeof contratoOpsSchema>

export const entregableOpsSchema = z.object({
  contratoOpsId: z.uuid(),
  descripcion: z.string().trim().min(3, 'Describe el entregable').max(500),
  fechaEntrega: fechaOpc,
})
export type EntregableOpsInput = z.infer<typeof entregableOpsSchema>

export const firmarContratoOpsSchema = z.object({
  contratoId: z.uuid(),
  rol: z.enum(['CONTRATISTA', 'CONTRATANTE']),
  firmaDataUri: z.string().min(1).startsWith('data:image/', 'Firma inválida'),
})
export type FirmarContratoOpsInput = z.infer<typeof firmarContratoOpsSchema>

export const cuentaCobroSchema = z.object({
  contratoOpsId: z.uuid(),
  periodo: z.string().regex(/^\d{4}-\d{2}$/, 'Periodo inválido (AAAA-MM)'),
  valor: z.coerce.number().min(0),
  fechaRadicacion: fecha,
  observaciones: z.string().trim().max(500).optional().or(z.literal('')),
})
export type CuentaCobroInput = z.infer<typeof cuentaCobroSchema>

export const soporteSsSchema = z.object({
  cuentaCobroId: z.uuid(),
  operador: z.string().trim().max(60).optional().or(z.literal('')),
  periodoCotizado: z.string().regex(/^\d{4}-\d{2}$/, 'Periodo inválido (AAAA-MM)'),
  ibcDeclarado: z.coerce.number().min(0).optional(),
  estadoVerificacion: z.enum(['PENDIENTE', 'VALIDA', 'INVALIDA']),
  observaciones: z.string().trim().max(500).optional().or(z.literal('')),
})
export type SoporteSsInput = z.infer<typeof soporteSsSchema>
