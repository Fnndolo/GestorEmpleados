'use client'

import { useEffect, useState } from 'react'
import { Check, ChevronsUpDown, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'

type Resultado = { id: string; nombre: string; detalle: string }

export function SelectorColaborador({
  value, onChange, placeholder = 'Selecciona un colaborador…',
}: {
  value?: string
  onChange: (id: string, nombre: string) => void
  placeholder?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [resultados, setResultados] = useState<Resultado[]>([])
  const [seleccionado, setSeleccionado] = useState<Resultado | null>(null)

  // Si llega ya elegido desde fuera (p. ej. `?colaborador=` en la URL) se
  // resuelve el nombre: "Colaborador seleccionado" no le dice nada a nadie.
  useEffect(() => {
    if (!value || seleccionado?.id === value) return
    const ctrl = new AbortController()
    void (async () => {
      try {
        const resp = await fetch(`/api/colaboradores/buscar?id=${encodeURIComponent(value)}`, { signal: ctrl.signal })
        const json = await resp.json()
        const r = (json.resultados ?? [])[0] as Resultado | undefined
        if (r) setSeleccionado(r)
      } catch { /* abortado */ }
    })()
    return () => ctrl.abort()
    // Solo cuando cambia el valor desde fuera; al elegir en la lista ya viene con nombre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  useEffect(() => {
    if (texto.trim().length < 2) return
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const resp = await fetch(`/api/colaboradores/buscar?q=${encodeURIComponent(texto.trim())}`, { signal: ctrl.signal })
        const json = await resp.json()
        setResultados(json.resultados ?? [])
      } catch { /* abortado */ }
    }, 200)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [texto])

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
          <span className="flex items-center gap-2 truncate">
            <User className="size-4 text-muted-foreground" />
            {seleccionado ? seleccionado.nombre : value ? 'Colaborador seleccionado' : placeholder}
          </span>
          <ChevronsUpDown className="size-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar por nombre o documento…"
            value={texto}
            onValueChange={(v) => { setTexto(v); if (v.trim().length < 2) setResultados([]) }}
          />
          <CommandList>
            <CommandEmpty>{texto.length < 2 ? 'Escribe al menos 2 letras.' : 'Sin resultados.'}</CommandEmpty>
            <CommandGroup>
              {resultados.map((r) => (
                <CommandItem
                  key={r.id}
                  value={r.id}
                  onSelect={() => { setSeleccionado(r); onChange(r.id, r.nombre); setAbierto(false) }}
                >
                  <Check className={cn('size-4', value === r.id ? 'opacity-100' : 'opacity-0')} />
                  <div className="flex flex-col">
                    <span>{r.nombre}</span>
                    <span className="text-xs text-muted-foreground">{r.detalle}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
