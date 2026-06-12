'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, Users } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

export type NodoOrg = {
  id: string
  nombre: string
  cargo: string
  tieneFoto: boolean
  jefeId: string | null
}

type Arbol = NodoOrg & { hijos: Arbol[] }

function construirArbol(nodos: NodoOrg[]): Arbol[] {
  const mapa = new Map<string, Arbol>()
  for (const n of nodos) mapa.set(n.id, { ...n, hijos: [] })
  const raices: Arbol[] = []
  for (const n of nodos) {
    const nodo = mapa.get(n.id)!
    if (n.jefeId && mapa.has(n.jefeId)) mapa.get(n.jefeId)!.hijos.push(nodo)
    else raices.push(nodo)
  }
  return raices
}

export function Organigrama({ nodos }: { nodos: NodoOrg[] }) {
  const raices = useMemo(() => construirArbol(nodos), [nodos])
  return (
    <div className="space-y-2">
      {raices.map((r) => (
        <NodoArbol key={r.id} nodo={r} nivel={0} />
      ))}
    </div>
  )
}

function iniciales(nombre: string) {
  const partes = nombre.split(' ').filter(Boolean)
  return `${partes[0]?.[0] ?? ''}${partes[1]?.[0] ?? ''}`.toUpperCase()
}

function NodoArbol({ nodo, nivel }: { nodo: Arbol; nivel: number }) {
  const [abierto, setAbierto] = useState(nivel < 2)
  const tieneHijos = nodo.hijos.length > 0

  return (
    <div>
      <div
        className="flex items-center gap-2 rounded-lg border bg-card p-2 hover:bg-accent/40 transition-colors"
        style={{ marginLeft: nivel * 20 }}
      >
        {tieneHijos ? (
          <button onClick={() => setAbierto((v) => !v)} className="text-muted-foreground hover:text-foreground" aria-label={abierto ? 'Contraer' : 'Expandir'}>
            {abierto ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <Avatar className="size-9">
          {nodo.tieneFoto && <AvatarImage src={`/api/documentos/foto/${nodo.id}`} alt="" />}
          <AvatarFallback className="text-xs">{iniciales(nodo.nombre)}</AvatarFallback>
        </Avatar>
        <Link href={`/colaboradores/${nodo.id}`} className="min-w-0 flex-1">
          <p className="font-medium text-sm truncate hover:underline">{nodo.nombre}</p>
          <p className="text-xs text-muted-foreground truncate">{nodo.cargo}</p>
        </Link>
        {tieneHijos && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="size-3.5" /> {contarDescendientes(nodo)}
          </span>
        )}
      </div>
      {tieneHijos && abierto && (
        <div className={cn('mt-2 space-y-2 border-l ml-3 pl-1')}>
          {nodo.hijos.map((h) => (
            <NodoArbol key={h.id} nodo={h} nivel={nivel + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

function contarDescendientes(nodo: Arbol): number {
  return nodo.hijos.reduce((acc, h) => acc + 1 + contarDescendientes(h), 0)
}
