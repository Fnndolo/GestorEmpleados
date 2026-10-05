'use client'

import { useRef, useState } from 'react'
import type React from 'react'
import Link from 'next/link'
import { TriangleAlert } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

type Fuera = { id: string; nombre: string; motivo: string }

/**
 * Quienes no entran en la nómina, como un ícono de advertencia en el encabezado:
 * la lista se despliega al pasar el mouse o al tocarlo (en el celular no hay hover).
 */
export function AvisoFuera({ fuera }: { fuera: Fuera[] }) {
  const [abierto, setAbierto] = useState(false)
  const cierre = useRef<ReturnType<typeof setTimeout>>(undefined)
  // Un respiro al salir, para alcanzar a mover el mouse del ícono a la lista.
  const entrar = (e: React.PointerEvent) => { if (e.pointerType !== 'mouse') return; clearTimeout(cierre.current); setAbierto(true) }
  const salir = (e: React.PointerEvent) => { if (e.pointerType !== 'mouse') return; cierre.current = setTimeout(() => setAbierto(false), 150) }
  const titulo = fuera.length === 1 ? '1 colaborador activo no entra en esta nómina' : `${fuera.length} colaboradores activos no entran en esta nómina`

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger
        aria-label={titulo}
        onPointerEnter={entrar}
        onPointerLeave={salir}
        className="inline-flex h-7 items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 text-xs font-medium text-amber-800 outline-none hover:bg-amber-500/20 focus-visible:ring-3 focus-visible:ring-ring/50 dark:text-amber-300"
      >
        <TriangleAlert className="size-4" /> {fuera.length}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(28rem,calc(100vw-2rem))]" onPointerEnter={entrar} onPointerLeave={salir}>
        <p className="flex items-start gap-2 font-medium text-amber-800 dark:text-amber-300">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {titulo}
        </p>
        <ul className="flex max-h-72 flex-wrap gap-1.5 overflow-y-auto">
          {fuera.map((f) => (
            <li key={f.id}>
              <Link href={`/colaboradores/${f.id}`} className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-0.5 text-xs hover:bg-accent">
                <span className="font-medium">{f.nombre}</span>
                <span className="text-muted-foreground">· {f.motivo}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          La nómina se liquida con el contrato laboral de cada persona. Cárgalo desde su ficha (Contratación → Subir contrato existente) y vuelve a calcular el periodo.
        </p>
      </PopoverContent>
    </Popover>
  )
}
