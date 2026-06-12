import type { Accion, Alcance, ModuloClave } from '@/lib/permisos/modulos'

/** Tipos y helpers de permisos PUROS (sin dependencias server-only). */

export type PermisoEfectivo = { modulo: string; accion: Accion; alcance: Alcance }

export type UsuarioSesion = {
  id: string
  email: string
  nombre: string
  rolId: string
  rolNombre: string
  estado: string
  debeCambiarPassword: boolean
  colaboradorId: string | null
  sedeIds: string[]
  permisos: PermisoEfectivo[]
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
