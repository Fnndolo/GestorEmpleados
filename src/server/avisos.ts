import 'server-only'
import { prisma } from '@/lib/db'
import type { UsuarioSesion } from '@/lib/permisos/tipos'
import { esAdministrador } from '@/lib/permisos/tipos'
import { esOps } from '@/lib/tramites-vinculo'
import { hoyBogota } from '@/lib/fechas'
import { audienciaIncluye, audienciaDe, type PerfilAudiencia } from '@/lib/avisos'

/**
 * Avisos de la plataforma en el servidor: qué le toca a cada persona, a
 * quiénes va un aviso al publicarlo y quién puede gestionarlos.
 */

/** Los publican el administrador y Talento Humano; el resto solo los lee. */
export function puedeGestionarAvisos(u: Pick<UsuarioSesion, 'rolNombre' | 'rolNombres'>): boolean {
  return esAdministrador(u) || u.rolNombre === 'Recursos Humanos' || u.rolNombres.includes('Recursos Humanos')
}

/** Rol, vínculo y sedes de una persona: lo que la audiencia de un aviso mira. */
export async function perfilAudiencia(usuario: UsuarioSesion): Promise<PerfilAudiencia> {
  const ficha = usuario.colaboradorId
    ? await prisma.colaborador.findUnique({ where: { id: usuario.colaboradorId }, select: { tipoVinculo: true, sedeId: true } })
    : null
  return {
    roles: [...new Set([usuario.rolNombre, ...usuario.rolNombres])],
    vinculo: ficha ? (esOps(ficha.tipoVinculo) ? 'OPS' : 'LABORAL') : null,
    sedeIds: [...new Set([...usuario.sedeIds, ...(ficha?.sedeId ? [ficha.sedeId] : [])])],
  }
}

export type AvisoParaUsuario = {
  id: string
  titulo: string
  resumen: string
  detalle: string | null
  tipo: string
  enlace: string | null
  imagenPath: string | null
  publicadoEn: Date
  vigenteHasta: Date | null
  vigente: boolean
  leido: boolean
}

/**
 * Los avisos publicados que le tocan a esta persona, del más reciente al más
 * antiguo, con si ya los leyó y si siguen vigentes (destacados).
 */
export async function avisosParaUsuario(usuario: UsuarioSesion): Promise<AvisoParaUsuario[]> {
  const [perfil, avisos, lecturas] = await Promise.all([
    perfilAudiencia(usuario),
    prisma.aviso.findMany({ where: { estado: 'PUBLICADO' }, orderBy: { publicadoEn: 'desc' }, take: 100 }),
    prisma.avisoLectura.findMany({ where: { userId: usuario.id }, select: { avisoId: true } }),
  ])
  const leidos = new Set(lecturas.map((l) => l.avisoId))
  const hoy = hoyBogota()
  return avisos
    .filter((a) => audienciaIncluye(audienciaDe(a.audiencia), perfil))
    .map((a) => ({
      id: a.id, titulo: a.titulo, resumen: a.resumen, detalle: a.detalle, tipo: a.tipo, enlace: a.enlace,
      imagenPath: a.imagenPath, publicadoEn: a.publicadoEn ?? a.creadoEn, vigenteHasta: a.vigenteHasta,
      vigente: !a.vigenteHasta || a.vigenteHasta >= hoy,
      leido: leidos.has(a.id),
    }))
}

/** Rutas de los módulos con un aviso vigente sin leer: la casilla muestra el punto de "nuevo". */
export function hrefsNuevos(avisos: AvisoParaUsuario[]): string[] {
  return [...new Set(avisos.filter((a) => a.vigente && !a.leido && a.enlace).map((a) => a.enlace!.split('?')[0]))]
}

/** Usuarios activos a los que les toca un aviso (para notificar al publicar). */
export async function usuariosDeAudiencia(audiencia: unknown): Promise<{ id: string; email: string }[]> {
  const a = audienciaDe(audiencia)
  const usuarios = await prisma.user.findMany({
    where: { estado: 'ACTIVO' },
    select: {
      id: true, email: true,
      rol: { select: { nombre: true } },
      rolesExtra: { select: { rol: { select: { nombre: true } } } },
      sedes: { select: { sedeId: true } },
      colaborador: { select: { tipoVinculo: true, sedeId: true } },
    },
  })
  return usuarios
    .filter((u) => audienciaIncluye(a, {
      roles: [u.rol.nombre, ...u.rolesExtra.map((r) => r.rol.nombre)],
      vinculo: u.colaborador ? (esOps(u.colaborador.tipoVinculo) ? 'OPS' : 'LABORAL') : null,
      sedeIds: [...u.sedes.map((s) => s.sedeId), ...(u.colaborador?.sedeId ? [u.colaborador.sedeId] : [])],
    }))
    .map((u) => ({ id: u.id, email: u.email }))
}
