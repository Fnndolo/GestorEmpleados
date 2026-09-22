import { requerirSesion } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { avisosParaUsuario, puedeGestionarAvisos, usuariosDeAudiencia } from '@/server/avisos'
import { describirAudiencia, audienciaDe } from '@/lib/avisos'
import { formatFechaISO } from '@/lib/fechas'
import { AvisosCliente, type AvisoLector, type AvisoGestion } from './avisos-cliente'

export const metadata = { title: 'Avisos · Smart Gadgets RH' }

const urlImagen = (id: string, path: string | null) => (path ? `/api/avisos/${id}/imagen?v=${encodeURIComponent(path)}` : null)

/**
 * Avisos de la plataforma: qué hay de nuevo y cómo se usa. Cualquiera lee los
 * suyos; el administrador y Talento Humano además los crean y publican aquí
 * mismo (pestaña Gestión).
 */
export default async function AvisosPage({ searchParams }: { searchParams: Promise<{ ver?: string; vista?: string }> }) {
  const usuario = await requerirSesion()
  const { ver, vista } = await searchParams
  const gestor = puedeGestionarAvisos(usuario)

  const mios = await avisosParaUsuario(usuario)
  const lector: AvisoLector[] = mios.map((a) => ({
    id: a.id, titulo: a.titulo, resumen: a.resumen, detalle: a.detalle, tipo: a.tipo, enlace: a.enlace,
    imagenUrl: urlImagen(a.id, a.imagenPath), publicadoEn: a.publicadoEn.toISOString(), vigente: a.vigente, leido: a.leido,
  }))

  let gestion: { avisos: AvisoGestion[]; roles: string[]; sedes: { id: string; nombre: string }[] } | null = null
  if (gestor) {
    const [todos, roles, sedes] = await Promise.all([
      prisma.aviso.findMany({ orderBy: [{ estado: 'asc' }, { creadoEn: 'desc' }], include: { _count: { select: { lecturas: true } } } }),
      prisma.rol.findMany({ orderBy: { nombre: 'asc' }, select: { nombre: true } }),
      prisma.sede.findMany({ where: { activa: true }, orderBy: { nombre: 'asc' }, select: { id: true, nombre: true } }),
    ])
    const nombresSede = Object.fromEntries(sedes.map((s) => [s.id, s.nombre]))
    // Cuántas personas abarca cada audiencia: es lo que da sentido a "visto por n de m".
    const totales = await Promise.all(todos.map((a) => (a.estado === 'PUBLICADO' ? usuariosDeAudiencia(a.audiencia).then((u) => u.length) : Promise.resolve(0))))
    gestion = {
      roles: roles.map((r) => r.nombre),
      sedes,
      avisos: todos.map((a, i) => ({
        id: a.id, titulo: a.titulo, resumen: a.resumen, detalle: a.detalle ?? '', tipo: a.tipo, enlace: a.enlace ?? '',
        estado: a.estado, publicadoEn: a.publicadoEn ? formatFechaISO(a.publicadoEn) : null,
        vigenteHasta: a.vigenteHasta ? formatFechaISO(a.vigenteHasta) : '',
        audiencia: audienciaDe(a.audiencia), audienciaTexto: describirAudiencia(a.audiencia, nombresSede),
        imagenUrl: urlImagen(a.id, a.imagenPath), leidos: a._count.lecturas, total: totales[i],
      })),
    }
  }

  return (
    <div className="max-w-4xl">
      <Encabezado enLinea volver titulo="Avisos" />
      <AvisosCliente avisos={lector} gestion={gestion} verId={ver ?? null} vistaInicial={vista === 'gestion' && gestor ? 'gestion' : 'avisos'} />
    </div>
  )
}
