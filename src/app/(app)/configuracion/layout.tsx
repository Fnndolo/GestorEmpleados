import { requerirSesion, tienePermiso } from '@/server/sesion'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { CabeceraAjustes } from './cabecera'
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
    /* Tres zonas de desplazamiento independientes, igual que en SST: la
       cabecera queda quieta, y el menú y el contenido tienen cada uno el suyo.
       Es altura MÁXIMA, no fija: con contenido corto el bloque mide lo que mide
       y no deja una franja vacía debajo; solo al pasarse del alto disponible
       aparecen los desplazamientos internos. El tope descuenta la barra superior
       de la app (3.5rem) y el relleno del contenedor (3rem). En móvil la página
       se desplaza entera. */
    <div className="max-w-6xl lg:flex lg:max-h-[calc(100dvh-6.5rem)] lg:flex-col lg:overflow-hidden">
      <CabeceraAjustes />
      <div className="grid items-start gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[236px_minmax(0,1fr)] lg:items-stretch">
        <RielConfiguracion hrefsVisibles={hrefsVisibles} contadores={contadores} />
        {/* `min-h-0` es imprescindible: sin él un hijo de grid no encoge y el
            desbordamiento se escapa al documento. */}
        <div className="min-w-0 lg:min-h-0 lg:overflow-y-auto lg:pb-6 lg:pr-1">{children}</div>
      </div>
    </div>
  )
}
