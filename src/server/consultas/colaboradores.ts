import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { alcanceDe, type UsuarioSesion } from '@/server/sesion'
import { sedeActualId } from '@/server/sede-actual'
import { normalizarTexto } from '@/lib/texto'

/**
 * Construye el `where` de Prisma para Colaborador según el alcance del usuario
 * y la sede activa seleccionada en el shell. Centraliza la regla de visibilidad.
 */
export async function whereColaboradores(
  usuario: UsuarioSesion,
  extra: Prisma.ColaboradorWhereInput = {},
  // `ignorarSedeActiva`: no aplicar el filtro de la cookie de sede del shell.
  // Se usa en vistas de detalle (ficha) donde la seguridad la da el ALCANCE, no
  // la sede seleccionada — así un rol TODAS_SEDES puede abrir a cualquiera aunque
  // tenga una sede puesta en el shell, sin exponer datos fuera de su alcance.
  opts: { ignorarSedeActiva?: boolean } = {},
): Promise<Prisma.ColaboradorWhereInput> {
  const alcance = alcanceDe(usuario, 'colaboradores', 'VER') ?? 'PROPIO'
  const sedeActiva = opts.ignorarSedeActiva ? null : await sedeActualId()

  const cond: Prisma.ColaboradorWhereInput = { ...extra }

  if (alcance === 'PROPIO') {
    cond.id = usuario.colaboradorId ?? '∅'
    return cond
  }
  if (alcance === 'EQUIPO') {
    // Su equipo directo (jefe inmediato = su colaborador) o él mismo.
    // El equipo ES el alcance; NO se filtra además por la sede global del shell
    // (esa cookie puede venir de otra sesión y ocultaría a todo el equipo).
    cond.OR = [
      { jefeInmediatoId: usuario.colaboradorId ?? '∅' },
      { id: usuario.colaboradorId ?? '∅' },
    ]
    return cond
  }
  if (alcance === 'SEDES_ASIGNADAS') {
    const permitidas = usuario.sedeIds.length ? usuario.sedeIds : ['∅']
    // Intersecta con la sede del shell (si es una de las suyas); nunca la sobrescribe
    // por una ajena — así fijar la cookie a otra sede no filtra fuera del alcance.
    cond.sedeId = sedeActiva && permitidas.includes(sedeActiva) ? sedeActiva : { in: permitidas }
    return cond
  }
  // TODAS_SEDES: sin restricción por alcance

  // Filtro adicional por la sede seleccionada en el shell (solo roles que navegan por sede)
  if (sedeActiva) {
    cond.sedeId = sedeActiva
  }
  return cond
}

/**
 * Filtro de búsqueda libre de colaboradores (nombre o documento).
 *
 * `busquedaNormalizada` es una columna cache: se recalcula en cada escritura y
 * por eso puede quedar desalineada si algún camino de creación se olvida de
 * llenarla (ya pasó con las fichas nacidas de un acuerdo de evaluación, que
 * quedaban con la cadena vacía e invisibles para todo buscador). Por eso además
 * de la columna se consultan los campos reales: la cache acelera y cubre la
 * búsqueda por nombre completo, los campos reales garantizan que nadie
 * desaparezca aunque la cache esté vacía o vieja.
 *
 * Va envuelto en `AND` a propósito: el `where` de alcance usa `OR` en el caso
 * EQUIPO, y un `OR` en el nivel raíz lo pisaría — dejando ver a todo el equipo
 * sin filtrar por el texto buscado.
 */
export function filtroBusquedaColaborador(q: string): Prisma.ColaboradorWhereInput {
  const texto = q.trim()
  if (!texto) return {}
  return {
    AND: [{
      OR: [
        { busquedaNormalizada: { contains: normalizarTexto(texto) } },
        { nombres: { contains: texto, mode: 'insensitive' } },
        { apellidos: { contains: texto, mode: 'insensitive' } },
        { numeroDocumento: { contains: texto } },
      ],
    }],
  }
}
