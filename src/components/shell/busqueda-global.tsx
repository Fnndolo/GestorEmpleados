'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, User } from 'lucide-react'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { SECCIONES } from '@/lib/navegacion'

type ResultadoColaborador = { id: string; nombre: string; detalle: string }

/**
 * Búsqueda global (Ctrl/Cmd+K): navega entre módulos y busca colaboradores por
 * nombre o documento (respetando el alcance del usuario en el servidor).
 */
export function BusquedaGlobal() {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [personas, setPersonas] = useState<ResultadoColaborador[]>([])

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

  useEffect(() => {
    if (texto.trim().length < 2) {
      setPersonas([])
      return
    }
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const resp = await fetch(`/api/colaboradores/buscar?q=${encodeURIComponent(texto.trim())}`, { signal: ctrl.signal })
        const json = await resp.json()
        setPersonas(json.resultados ?? [])
      } catch {
        /* abortado */
      }
    }, 200)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [texto])

  function ir(href: string) {
    setAbierto(false)
    setTexto('')
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
        <Command shouldFilter={false}>
        <CommandInput placeholder="Buscar módulo o colaborador…" value={texto} onValueChange={setTexto} />
        <CommandList>
          <CommandEmpty>Sin resultados.</CommandEmpty>
          {personas.length > 0 && (
            <CommandGroup heading="Colaboradores">
              {personas.map((p) => (
                <CommandItem key={p.id} value={`col-${p.id}`} onSelect={() => ir(`/colaboradores/${p.id}`)}>
                  <User className="size-4" />
                  <div className="flex flex-col">
                    <span>{p.nombre}</span>
                    <span className="text-xs text-muted-foreground">{p.detalle}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {SECCIONES.map((seccion) => {
            const items = seccion.items.filter((i) =>
              !texto.trim() || i.titulo.toLowerCase().includes(texto.trim().toLowerCase()),
            )
            if (items.length === 0) return null
            return (
              <CommandGroup key={seccion.titulo} heading={seccion.titulo}>
                {items.map((item) => (
                  <CommandItem key={item.href} value={item.href} onSelect={() => ir(item.href)}>
                    <item.icono className="size-4" />
                    {item.titulo}
                  </CommandItem>
                ))}
              </CommandGroup>
            )
          })}
        </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}
