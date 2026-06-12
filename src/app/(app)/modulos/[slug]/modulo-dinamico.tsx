'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { fmtCOP } from '@/lib/moneda'
import { formatFechaCorta } from '@/lib/fechas'
import { agregarRegistro } from '@/app/(app)/configuracion/modulos/acciones'

type Campo = { clave: string; etiqueta: string; tipo: string; requerido: boolean; opciones: string | null; mostrarEnTabla: boolean }
type Registro = { id: string; datos: Record<string, unknown> }

export function ModuloDinamico({ moduloId, campos, registros, puedeEditar }: { moduloId: string; campos: Campo[]; registros: Registro[]; puedeEditar: boolean }) {
  const [abierto, setAbierto] = useState(false)
  const columnas = campos.filter((c) => c.mostrarEnTabla)

  function formato(c: Campo, valor: unknown): string {
    if (valor == null || valor === '') return '—'
    if (c.tipo === 'MONEDA') return fmtCOP(Number(valor))
    if (c.tipo === 'FECHA') return formatFechaCorta(new Date(String(valor)))
    if (c.tipo === 'SI_NO') return valor ? 'Sí' : 'No'
    return String(valor)
  }

  return (
    <div className="space-y-4">
      {puedeEditar && <div className="flex justify-end"><Button size="sm" onClick={() => setAbierto(true)}><Plus className="size-4" /> Nuevo registro</Button></div>}
      {registros.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Sin registros.</CardContent></Card>
      ) : (
        <Card><CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted"><tr>{columnas.map((c) => <th key={c.clave} className="p-3 text-left font-medium">{c.etiqueta}</th>)}</tr></thead>
            <tbody>
              {registros.map((r) => (
                <tr key={r.id} className="border-t">{columnas.map((c) => <td key={c.clave} className="p-3">{formato(c, r.datos[c.clave])}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </CardContent></Card>
      )}
      {abierto && <DialogRegistro moduloId={moduloId} campos={campos} onClose={() => setAbierto(false)} />}
    </div>
  )
}

function DialogRegistro({ moduloId, campos, onClose }: { moduloId: string; campos: Campo[]; onClose: () => void }) {
  const router = useRouter()
  const [datos, setDatos] = useState<Record<string, unknown>>({})
  const [g, setG] = useState(false)
  const set = (k: string, v: unknown) => setDatos((p) => ({ ...p, [k]: v }))

  async function guardar() {
    for (const c of campos) if (c.requerido && !datos[c.clave]) { toast.error(`El campo "${c.etiqueta}" es requerido.`); return }
    setG(true)
    const res = await agregarRegistro({ moduloId, datos })
    setG(false)
    if (res.ok) { toast.success('Registro agregado.'); onClose(); router.refresh() } else toast.error(res.error)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nuevo registro</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {campos.map((c) => (
            <div key={c.clave} className="space-y-1.5">
              <Label>{c.etiqueta}{c.requerido && <span className="text-destructive"> *</span>}</Label>
              {c.tipo === 'TEXTO_LARGO' ? <Textarea rows={2} onChange={(e) => set(c.clave, e.target.value)} />
                : c.tipo === 'NUMERO' || c.tipo === 'DECIMAL' || c.tipo === 'MONEDA' ? <Input type="number" onChange={(e) => set(c.clave, Number(e.target.value))} />
                : c.tipo === 'FECHA' ? <Input type="date" onChange={(e) => set(c.clave, e.target.value)} />
                : c.tipo === 'SI_NO' ? <label className="flex items-center gap-2 text-sm"><Checkbox onCheckedChange={(v) => set(c.clave, Boolean(v))} /> Sí</label>
                : c.tipo === 'OPCION' ? (
                  <Select onValueChange={(v) => set(c.clave, v)}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                    <SelectContent>{(c.opciones ?? '').split(',').map((o) => o.trim()).filter(Boolean).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select>
                )
                : <Input onChange={(e) => set(c.clave, e.target.value)} />}
            </div>
          ))}
        </div>
        <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={guardar} disabled={g}>{g && <Spinner />}Guardar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
