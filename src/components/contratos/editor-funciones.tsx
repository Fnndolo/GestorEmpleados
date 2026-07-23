'use client'

import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { FuncionesCargo } from '@/lib/contrato-variables'

/**
 * Editor estructurado de funciones del cargo: grupos con viñetas, cada uno con
 * añadir / editar / eliminar (como las cláusulas). Los textos llevan corrector
 * ortográfico del navegador en español (tildes y palabras mal escritas).
 */
export function EditorFunciones({ value, onChange }: { value: FuncionesCargo; onChange: (v: FuncionesCargo) => void }) {
  const grupos = value ?? []

  const setGrupo = (gi: number, patch: Partial<{ grupo: string; items: string[] }>) =>
    onChange(grupos.map((g, i) => (i === gi ? { ...g, ...patch } : g)))
  const addGrupo = () => onChange([...grupos, { grupo: 'Nuevo grupo', items: [''] }])
  const delGrupo = (gi: number) => onChange(grupos.filter((_, i) => i !== gi))
  const moveGrupo = (gi: number, dir: -1 | 1) => {
    const j = gi + dir
    if (j < 0 || j >= grupos.length) return
    const n = [...grupos]
    ;[n[gi], n[j]] = [n[j], n[gi]]
    onChange(n)
  }
  const setItem = (gi: number, ii: number, val: string) => setGrupo(gi, { items: grupos[gi].items.map((it, i) => (i === ii ? val : it)) })
  const addItem = (gi: number) => setGrupo(gi, { items: [...grupos[gi].items, ''] })
  const delItem = (gi: number, ii: number) => setGrupo(gi, { items: grupos[gi].items.filter((_, i) => i !== ii) })

  return (
    <div className="space-y-3">
      {grupos.map((g, gi) => (
        <div key={gi} className="rounded-md border bg-background p-2">
          <div className="flex items-center gap-1">
            <Input
              value={g.grupo}
              onChange={(e) => setGrupo(gi, { grupo: e.target.value })}
              placeholder="Título del grupo (p. ej. I. Funciones principales)"
              className="h-8 text-sm font-medium"
              spellCheck
              lang="es"
            />
            <Button type="button" size="icon" variant="ghost" className="size-7" onClick={() => moveGrupo(gi, -1)} disabled={gi === 0}><ArrowUp className="size-3.5" /></Button>
            <Button type="button" size="icon" variant="ghost" className="size-7" onClick={() => moveGrupo(gi, 1)} disabled={gi === grupos.length - 1}><ArrowDown className="size-3.5" /></Button>
            <Button type="button" size="icon" variant="ghost" className="size-7 text-destructive" onClick={() => delGrupo(gi)}><Trash2 className="size-3.5" /></Button>
          </div>
          <div className="mt-2 space-y-1.5 pl-2">
            {g.items.map((it, ii) => (
              <div key={ii} className="flex items-start gap-1">
                <span className="mt-2 text-muted-foreground">•</span>
                <Textarea
                  value={it}
                  onChange={(e) => setItem(gi, ii, e.target.value)}
                  rows={2}
                  className="min-h-0 flex-1 text-xs"
                  placeholder="Función…"
                  spellCheck
                  lang="es"
                />
                <Button type="button" size="icon" variant="ghost" className="size-7 shrink-0 text-destructive" onClick={() => delItem(gi, ii)}><Trash2 className="size-3.5" /></Button>
              </div>
            ))}
            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => addItem(gi)}><Plus className="size-3.5" /> Añadir ítem</Button>
          </div>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" onClick={addGrupo}><Plus className="size-4" /> Añadir grupo de funciones</Button>
      {grupos.length === 0 && <p className="text-xs text-muted-foreground">Sin funciones. Añade un grupo.</p>}
    </div>
  )
}
