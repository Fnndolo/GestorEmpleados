import { requerirSesion, tienePermiso } from '@/server/sesion'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { RielConfiguracion } from './riel'
import { GRUPOS, type Contadores } from './secciones'

/**
 * Configuración es una sola pantalla: el menú de secciones vive aquí, en el
 * layout, y solo cambia el panel de la derecha. Al ser un layout de Next, no se
 * vuelve a montar al navegar entre secciones — el menú se queda quieto —, y a
 * la vez cada sección sigue cargando únicamente SUS datos, en vez de traer los
 * quince catálogos de una.
 */
export default async function ConfiguracionLayout({ children }: { children: React.ReactNode }) {
  const usuario = await requerirSesion()
  const verConfig = tienePermiso(usuario, 'configuracion', 'VER')
  const verUsuarios = tienePermiso(usuario, 'usuarios', 'VER')
  if (!verConfig && !verUsuarios) redirect('/')

  const hrefsVisibles = GRUPOS.flatMap((g) => g.secciones)
    .filter((s) => (s.modulo === 'usuarios' ? verUsuarios : verConfig))
    .map((s) => s.href)

  // Contadores del menú. Son `count`, no lecturas completas: sirven para decir
  // cuántos hay y, sobre todo, qué catálogo está vacío.
  const [sedes, areas, cargos, usuarios, roles, tiposDocumento, reglasAlerta, parametrosNomina, conceptosNomina, plantillasCuentaCobro, plantillasContrato] =
    await Promise.all([
      prisma.sede.count(),
      prisma.area.count(),
      prisma.cargo.count(),
      prisma.user.count(),
      prisma.rol.count(),
      prisma.tipoDocumento.count(),
      prisma.reglaAlerta.count(),
      prisma.parametroLegal.count(),
      prisma.conceptoNomina.count(),
      prisma.plantillaCuentaCobro.count(),
      prisma.plantillaContrato.count({ where: { activa: true } }),
    ])
  const contadores: Contadores = {
    sedes, areas, cargos, usuarios, roles,
    tiposDocumento, reglasAlerta, parametrosNomina, conceptosNomina, plantillasCuentaCobro,
    plantillasContrato,
  }

  return (
    <div className="max-w-6xl">
      <Encabezado
        titulo="Ajustes"
        descripcion="Los parámetros y catálogos de la plataforma. Empieza por los datos de tu empresa: encabezan todo lo que ella firma."
      />
      <div className="grid items-start gap-4 lg:grid-cols-[232px_minmax(0,1fr)]">
        <RielConfiguracion hrefsVisibles={hrefsVisibles} contadores={contadores} />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  )
}
