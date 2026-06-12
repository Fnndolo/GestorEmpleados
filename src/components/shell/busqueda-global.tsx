'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { SECCIONES } from '@/lib/navegacion'

/**
 * Búsqueda global (Ctrl/Cmd+K). En F1 navega entre módulos; en F2 se le añade
 * la búsqueda de colaboradores por nombre/cédula (pg_trgm) respetando alcance.
 */
export function BusquedaGlobal() {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setAbierto((v) => !v)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  function ir(href: string) {
    setAbierto(false)
    router.push(href)
  }

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        className="flex w-full items-center gap-2 rounded-md border bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors"
      >
        <Search className="size-4" />
        <span>Buscar…</span>
        <kbd className="ml-auto hidden md:inline-flex items-center gap-0.5 rounded border bg-background px-1.5 text-[10px] font-medium">
          Ctrl K
        </kbd>
      </button>
      <CommandDialog open={abierto} onOpenChange={setAbierto}>
        <CommandInput placeholder="Buscar módulo o persona…" />
        <CommandList>
          <CommandEmpty>Sin resultados.</CommandEmpty>
          {SECCIONES.map((seccion) => (
            <CommandGroup key={seccion.titulo} heading={seccion.titulo}>
              {seccion.items.map((item) => (
                <CommandItem
                  key={item.href}
                  value={item.titulo}
                  onSelect={() => ir(item.href)}
                >
                  <item.icono className="size-4" />
                  {item.titulo}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  )
}
