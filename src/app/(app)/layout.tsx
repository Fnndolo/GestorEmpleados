import { requerirSesion } from '@/server/sesion'
import { hrefsVisibles } from '@/lib/navegacion'
import { sedesDisponibles, sedeActualId } from '@/server/sede-actual'
import { Logo } from '@/components/marca/logo'
import { NavLinks } from '@/components/shell/nav-links'
import { SelectorSede } from '@/components/shell/selector-sede'
import { MenuUsuario } from '@/components/shell/menu-usuario'
import { DrawerMovil } from '@/components/shell/drawer-movil'
import { BottomNav } from '@/components/shell/bottom-nav'
import { Campana } from '@/components/shell/campana'
import { BusquedaGlobal } from '@/components/shell/busqueda-global'
import { RegistrarSW } from '@/components/pwa/registrar-sw'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const usuario = await requerirSesion()
  const visibles = hrefsVisibles(usuario)
  const sedes = await sedesDisponibles(usuario)
  const sedeActual = await sedeActualId()
  const datosUsuario = { nombre: usuario.nombre, email: usuario.email, rol: usuario.rolNombre }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <RegistrarSW />

      {/* Sidebar de escritorio */}
      <aside className="hidden lg:flex flex-col border-r bg-card sticky top-0 h-screen">
        <div className="p-4 border-b">
          <Logo />
        </div>
        <div className="p-3 border-b">
          <SelectorSede sedes={sedes} actual={sedeActual} />
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <NavLinks hrefsVisibles={visibles} />
        </div>
        <div className="border-t p-2">
          <MenuUsuario {...datosUsuario} />
        </div>
      </aside>

      {/* Columna principal */}
      <div className="flex flex-col min-h-screen">
        {/* Barra superior */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:px-6">
          <DrawerMovil
            hrefsVisibles={visibles}
            sedes={sedes}
            sedeActual={sedeActual}
            usuario={datosUsuario}
          />
          <div className="lg:hidden">
            <Logo compacto />
          </div>
          <div className="flex-1 max-w-md hidden sm:block">
            <BusquedaGlobal />
          </div>
          <div className="flex-1 sm:hidden" />
          <Campana />
        </header>

        {/* Contenido */}
        <main className="flex-1 p-4 pb-24 lg:p-6 lg:pb-6">{children}</main>
      </div>

      {/* Barra inferior móvil */}
      <BottomNav hrefsVisibles={visibles} />
    </div>
  )
}
