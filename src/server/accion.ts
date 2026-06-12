import 'server-only'
import { headers } from 'next/headers'
import { z } from 'zod'
import { ejecutarConContexto } from '@/server/contexto'
import {
  ErrorPermiso,
  obtenerSesion,
  requerirPermiso,
  type UsuarioSesion,
} from '@/server/sesion'
import type { Accion, Alcance, ModuloClave } from '@/lib/permisos/modulos'

export type ResultadoAccion<T> =
  | { ok: true; datos: T }
  | { ok: false; error: string; campos?: Record<string, string[]> }

/**
 * Envuelve una Server Action: valida permiso, establece el contexto de
 * auditoría (usuario + IP) y traduce errores conocidos a un resultado uniforme.
 *
 *   export const crearSede = accion(
 *     { modulo: 'configuracion', accion: 'CREAR', schema: sedeSchema },
 *     async (datos, usuario) => { ... }
 *   )
 */
export function accion<TInput, TOutput>(
  opts: {
    modulo: ModuloClave
    accion: Accion
    schema?: z.ZodType<TInput>
  },
  manejador: (entrada: TInput, usuario: UsuarioSesion) => Promise<TOutput>,
) {
  return async (entrada: TInput): Promise<ResultadoAccion<TOutput>> => {
    try {
      const usuario = await requerirPermiso(opts.modulo, opts.accion)

      let datosValidados = entrada
      if (opts.schema) {
        const parsed = opts.schema.safeParse(entrada)
        if (!parsed.success) {
          return {
            ok: false,
            error: 'Datos inválidos. Revisa el formulario.',
            campos: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
          }
        }
        datosValidados = parsed.data
      }

      const hdrs = await headers()
      const ip =
        hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ?? hdrs.get('x-real-ip') ?? null

      const resultado = await ejecutarConContexto(
        { userId: usuario.id, userEmail: usuario.email, ip },
        () => manejador(datosValidados, usuario),
      )
      return { ok: true, datos: resultado }
    } catch (e) {
      if (e instanceof ErrorPermiso) {
        return { ok: false, error: 'No tienes permiso para realizar esta acción.' }
      }
      if (e instanceof ErrorNegocio) {
        return { ok: false, error: e.message }
      }
      console.error('Error en acción:', e)
      return { ok: false, error: 'Ocurrió un error inesperado. Intenta de nuevo.' }
    }
  }
}

/** Error de regla de negocio cuyo mensaje SÍ se muestra al usuario. */
export class ErrorNegocio extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ErrorNegocio'
  }
}

/**
 * Construye un filtro Prisma `where` según el alcance del permiso del usuario.
 * - TODAS_SEDES → sin restricción
 * - SEDES_ASIGNADAS → registros de las sedes del usuario
 * - EQUIPO → (se afina por módulo en F2+; por ahora restringe a sedes del usuario)
 * - PROPIO → solo su propio registro (requiere colaboradorId)
 *
 * `campoSede` es el nombre del campo de sede en el modelo (por defecto "sedeId").
 */
export function filtroAlcance(
  usuario: UsuarioSesion,
  alcance: Alcance,
  opts: { campoSede?: string; campoColaborador?: string } = {},
): Record<string, unknown> {
  const campoSede = opts.campoSede ?? 'sedeId'
  const campoColaborador = opts.campoColaborador ?? 'colaboradorId'

  switch (alcance) {
    case 'TODAS_SEDES':
      return {}
    case 'SEDES_ASIGNADAS':
    case 'EQUIPO':
      return usuario.sedeIds.length > 0 ? { [campoSede]: { in: usuario.sedeIds } } : { id: '∅' }
    case 'PROPIO':
      return usuario.colaboradorId
        ? { [campoColaborador]: usuario.colaboradorId }
        : { id: '∅' }
    default:
      return { id: '∅' }
  }
}

export async function usuarioOpcional(): Promise<UsuarioSesion | null> {
  return obtenerSesion()
}
