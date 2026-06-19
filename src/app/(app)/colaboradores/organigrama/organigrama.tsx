'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { Download } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'

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

function iniciales(nombre: string) {
  const partes = nombre.split(' ').filter(Boolean)
  return `${partes[0]?.[0] ?? ''}${partes[1]?.[0] ?? ''}`.toUpperCase()
}

// Conectores del organigrama (líneas) — CSS global para que también se copie al exportar.
const CSS_ORG = `
.org-tree, .org-tree ul { list-style: none; margin: 0; padding: 0; }
.org-tree ul { display: flex; justify-content: center; position: relative; }
.org-tree li { position: relative; padding: 26px 14px 0; text-align: center; }
.org-tree li::before, .org-tree li::after {
  content: ''; position: absolute; top: 0; right: 50%;
  border-top: 1.5px solid #cbd5e1; width: 50%; height: 26px;
}
.org-tree li::after { right: auto; left: 50%; border-left: 1.5px solid #cbd5e1; }
.org-tree li:only-child::after, .org-tree li:only-child::before { display: none; }
.org-tree li:first-child::before, .org-tree li:last-child::after { border: 0 none; }
.org-tree li:last-child::before { border-right: 1.5px solid #cbd5e1; }
.org-tree > li { padding-top: 0; }
.org-tree > li::before, .org-tree > li::after { display: none; }
.org-tree ul::before {
  content: ''; position: absolute; top: 0; left: 50%;
  border-left: 1.5px solid #cbd5e1; width: 0; height: 26px;
}
.org-node { display: inline-flex; vertical-align: top; }
`

export function Organigrama({ nodos }: { nodos: NodoOrg[] }) {
  const raices = useMemo(() => construirArbol(nodos), [nodos])

  function exportar() {
    const chart = document.getElementById('org-chart')
    if (!chart) return
    const estilos = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map((s) => s.outerHTML).join('\n')
    const win = window.open('', '_blank', 'width=1280,height=900')
    if (!win) return
    win.document.write(
      `<!doctype html><html><head><title>Organigrama — Smart Gadgets</title>${estilos}` +
      `<style>@page{size:landscape;margin:12mm} body{padding:24px;background:#fff}</style></head>` +
      `<body><h2 style="font-family:sans-serif;margin:0 0 16px">Organigrama</h2>${chart.outerHTML}</body></html>`,
    )
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 500)
  }

  return (
    <div className="space-y-3">
      <style dangerouslySetInnerHTML={{ __html: CSS_ORG }} />
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={exportar}><Download className="size-4" /> Exportar (PDF)</Button>
      </div>
      <div className="overflow-x-auto pb-4">
        <div id="org-chart" className="inline-block min-w-full px-4">
          <ul className="org-tree">
            {raices.map((r) => <Nodo key={r.id} nodo={r} />)}
          </ul>
        </div>
      </div>
    </div>
  )
}

function Nodo({ nodo }: { nodo: Arbol }) {
  return (
    <li>
      <div className="org-node w-44 flex-col items-center gap-1.5 rounded-xl border bg-card p-3 shadow-sm">
        <Avatar className="size-14">
          {nodo.tieneFoto && <AvatarImage src={`/api/documentos/foto/${nodo.id}`} alt="" />}
          <AvatarFallback className="text-sm">{iniciales(nodo.nombre)}</AvatarFallback>
        </Avatar>
        <Link href={`/colaboradores/${nodo.id}`} className="font-medium text-sm leading-tight hover:underline">{nodo.nombre}</Link>
        <p className="text-xs text-muted-foreground leading-tight">{nodo.cargo}</p>
      </div>
      {nodo.hijos.length > 0 && (
        <ul>
          {nodo.hijos.map((h) => <Nodo key={h.id} nodo={h} />)}
        </ul>
      )}
    </li>
  )
}
