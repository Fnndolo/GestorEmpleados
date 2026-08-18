import type { Accion, Alcance, ModuloClave } from '@/lib/permisos/modulos'

/** Tipos y helpers de permisos PUROS (sin dependencias server-only). */

export type PermisoEfectivo = { modulo: string; accion: Accion; alcance: Alcance }

export type UsuarioSesion = {
  id: string
  email: string
  nombre: string
  /** Rol principal (User.rolId). Los adicionales van en `rolNombres`. */
  rolId: string
  rolNombre: string
  /** Nombres de todos los roles del usuario, empezando por el principal. */
  rolNombres: string[]
  estado: string
  debeCambiarPassword: boolean
  colaboradorId: string | null
  sedeIds: string[]
  permisos: PermisoEfectivo[]
}

/**
 * Amplitud de cada alcance, de mayor a menor. Se usa para decidir cuál gana
 * cuando un usuario con varios roles recibe el mismo permiso por dos vías.
 */
const AMPLITUD: Record<Alcance, number> = {
  TODAS_SEDES: 4,
  SEDES_ASIGNADAS: 3,
  EQUIPO: 2,
  PROPIO: 1,
}

/**
 * Une los permisos de varios roles en una sola lista sin repetidos.
 *
 * Cuando el mismo (módulo, acción) llega por dos roles con alcances distintos
 * —p. ej. `colaboradores:VER` con EQUIPO desde "Jefe de área" y con
 * TODAS_SEDES desde "Recursos Humanos"— se conserva **el más amplio**. Sin
 * esta fusión el resultado dependería del orden de las filas en la base, que
 * es justo lo que no puede pasar en un control de acceso.
 */
export function fusionarPermisos(listas: PermisoEfectivo[][]): PermisoEfectivo[] {
  const porClave = new Map<string, PermisoEfectivo>()
  for (const permiso of listas.flat()) {
    const clave = `${permiso.modulo}::${permiso.accion}`
    const previo = porClave.get(clave)
    if (!previo || AMPLITUD[permiso.alcance] > AMPLITUD[previo.alcance]) {
      porClave.set(clave, permiso)
    }
  }
  return [...porClave.values()]
}

export function tienePermiso(
  usuario: UsuarioSesion,
  modulo: ModuloClave,
  accion: Accion,
): boolean {
  return usuario.permisos.some((p) => p.modulo === modulo && p.accion === accion)
}

export function alcanceDe(
  usuario: UsuarioSesion,
  modulo: ModuloClave,
  accion: Accion,
): Alcance | null {
  const p = usuario.permisos.find((x) => x.modulo === modulo && x.accion === accion)
  return p?.alcance ?? null
}
