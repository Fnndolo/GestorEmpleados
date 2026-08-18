import { z } from 'zod'

// Roles adicionales al principal: quien cubre dos frentes a la vez suma los
// permisos de ambos (el alcance más amplio gana; ver fusionarPermisos).
const rolIdsExtra = z.array(z.uuid())

export const crearUsuarioSchema = z.object({
  nombre: z.string().trim().min(3, 'Indica el nombre completo').max(150),
  email: z.email('Correo inválido'),
  rolId: z.uuid('Selecciona un rol'),
  rolIdsExtra,
  telefonoE164: z.string().trim().max(20).optional().or(z.literal('')),
  sedeIds: z.array(z.uuid()),
})
export type CrearUsuarioInput = z.infer<typeof crearUsuarioSchema>

export const editarUsuarioSchema = z.object({
  id: z.uuid(),
  nombre: z.string().trim().min(3).max(150),
  rolId: z.uuid('Selecciona un rol'),
  rolIdsExtra,
  estado: z.enum(['ACTIVO', 'INACTIVO', 'BLOQUEADO']),
  telefonoE164: z.string().trim().max(20).optional().or(z.literal('')),
  sedeIds: z.array(z.uuid()),
})
export type EditarUsuarioInput = z.infer<typeof editarUsuarioSchema>

export const rolSchema = z.object({
  nombre: z.string().trim().min(2, 'Indica un nombre').max(60),
  descripcion: z.string().trim().max(300).optional().or(z.literal('')),
})
export type RolInput = z.infer<typeof rolSchema>

const accionEnum = z.enum(['VER', 'CREAR', 'EDITAR', 'ELIMINAR', 'APROBAR', 'EXPORTAR'])
const alcanceEnum = z.enum(['TODAS_SEDES', 'SEDES_ASIGNADAS', 'EQUIPO', 'PROPIO'])

export const matrizPermisosSchema = z.object({
  rolId: z.uuid(),
  permisos: z.array(
    z.object({
      modulo: z.string().min(1),
      accion: accionEnum,
      alcance: alcanceEnum,
    }),
  ),
})
export type MatrizPermisosInput = z.infer<typeof matrizPermisosSchema>
