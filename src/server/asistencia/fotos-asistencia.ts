import 'server-only'
import { prisma } from '@/lib/db'
import { leerArchivo } from '@/server/storage'
import { conexionAsistencia, subirAvatar, quitarAvatar, ErrorAsistencia } from '@/server/asistencia/cliente'

/**
 * La foto de perfil del gestor también es la de AsistencIA: cada vez que aquí
 * se pone, cambia o quita, se replica allá por cédula. Es de mejor esfuerzo y
 * corre después de responder (after): la foto del gestor nunca depende de que
 * el otro sistema esté arriba, y si falló, «Enviar fotos» en Ajustes →
 * Integraciones vuelve a mandarlas todas.
 */

export type ResultadoFoto = { ok: true } | { ok: false; motivo: 'SIN_CONEXION' | 'SIN_FOTO' | 'NO_EXISTE' | 'ERROR'; detalle?: string }

const MIME: Record<string, 'image/jpeg' | 'image/png' | 'image/webp'> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

function mimeDe(ruta: string): 'image/jpeg' | 'image/png' | 'image/webp' {
  const ext = ruta.split('.').pop()?.toLowerCase() ?? ''
  return MIME[ext] ?? 'image/jpeg'
}

/** Manda a AsistencIA la foto que el colaborador tiene hoy en el gestor. */
export async function enviarFotoAsistencia(colaboradorId: string): Promise<ResultadoFoto> {
  if (!(await conexionAsistencia())) return { ok: false, motivo: 'SIN_CONEXION' }
  const c = await prisma.colaborador.findUnique({ where: { id: colaboradorId }, select: { numeroDocumento: true, fotoPath: true } })
  if (!c?.fotoPath) return { ok: false, motivo: 'SIN_FOTO' }
  try {
    const imagen = await leerArchivo(c.fotoPath)
    await subirAvatar(c.numeroDocumento, imagen, mimeDe(c.fotoPath))
    return { ok: true }
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e)
    if (e instanceof ErrorAsistencia && e.codigo === 'NO_EXISTE') return { ok: false, motivo: 'NO_EXISTE', detalle }
    console.error('No se pudo enviar la foto a AsistencIA:', detalle)
    return { ok: false, motivo: 'ERROR', detalle }
  }
}

/** Quita en AsistencIA la foto de una persona que la quitó aquí. */
export async function quitarFotoAsistencia(colaboradorId: string): Promise<ResultadoFoto> {
  if (!(await conexionAsistencia())) return { ok: false, motivo: 'SIN_CONEXION' }
  const c = await prisma.colaborador.findUnique({ where: { id: colaboradorId }, select: { numeroDocumento: true } })
  if (!c) return { ok: false, motivo: 'NO_EXISTE' }
  try {
    await quitarAvatar(c.numeroDocumento)
    return { ok: true }
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e)
    if (e instanceof ErrorAsistencia && e.codigo === 'NO_EXISTE') return { ok: false, motivo: 'NO_EXISTE', detalle }
    console.error('No se pudo quitar la foto en AsistencIA:', detalle)
    return { ok: false, motivo: 'ERROR', detalle }
  }
}

/**
 * Manda de una vez todas las fotos de los colaboradores activos. Para alinear
 * los dos sistemas al conectar por primera vez, o después de una caída.
 */
export async function sincronizarFotosAsistencia(): Promise<{
  enviadas: number
  sinFoto: number
  noExisten: { nombre: string; documento: string }[]
  fallidas: { nombre: string; detalle: string }[]
}> {
  const activos = await prisma.colaborador.findMany({
    where: { estado: 'ACTIVO' },
    select: { id: true, nombres: true, apellidos: true, numeroDocumento: true, fotoPath: true },
    orderBy: { apellidos: 'asc' },
  })
  const r = { enviadas: 0, sinFoto: 0, noExisten: [] as { nombre: string; documento: string }[], fallidas: [] as { nombre: string; detalle: string }[] }
  for (const c of activos) {
    const nombre = `${c.nombres} ${c.apellidos}`
    if (!c.fotoPath) { r.sinFoto++; continue }
    const res = await enviarFotoAsistencia(c.id)
    if (res.ok) r.enviadas++
    else if (res.motivo === 'NO_EXISTE') r.noExisten.push({ nombre, documento: c.numeroDocumento })
    else if (res.motivo === 'ERROR') r.fallidas.push({ nombre, detalle: res.detalle ?? '' })
  }
  return r
}
