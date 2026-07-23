'use client'

import { useState } from 'react'
import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Logo } from '@/components/marca/logo'
import { NavLinks, type ModuloCustom } from './nav-links'
import { SelectorSede } from './selector-sede'
import { MenuUsuario } from './menu-usuario'
import type { OpcionSede } from '@/server/sede-actual'

export function DrawerMovil({
  hrefsVisibles,
  modulosCustom = [],
  badges,
  sedes,
  sedeActual,
  usuario,
}: {
  hrefsVisibles: string[]
  modulosCustom?: ModuloCustom[]
  badges?: Record<string, number>
  sedes: OpcionSede[]
  sedeActual: string | null
  usuario: { nombre: string; email: string; rol: string }
}) {
  const [abierto, setAbierto] = useState(false)

  return (
    <Sheet open={abierto} onOpenChange={setAbierto}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menú">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[280px] p-0 flex flex-col gap-0">
        <SheetHeader className="border-b p-4">
          <SheetTitle asChild>
            <div>
              <Logo />
            </div>
          </SheetTitle>
        </SheetHeader>
        <div className="p-4 border-b">
          <SelectorSede sedes={sedes} actual={sedeActual} />
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <NavLinks hrefsVisibles={hrefsVisibles} modulosCustom={modulosCustom} badges={badges} onNavegar={() => setAbierto(false)} />
        </div>
        <div className="border-t p-2">
          <MenuUsuario {...usuario} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
