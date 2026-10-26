'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2 } from 'lucide-react'
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
import { agregarRegistro, editarRegistro, eliminarRegistro } from '@/app/(app)/configuracion/modulos/acciones'
import { DialogMotivo } from '@/app/(app)/configuracion/dialog-motivo'

type Campo = { clave: string; etiqueta: string; tipo: string; requerido: boolean; opciones: string | null; mostrarEnTabla: boolean }
type Registro = { id: string; datos: Record<string, unknown> }

export function ModuloDinamico({ moduloId, campos, registros, puedeEditar, puedeEliminar = false }: { moduloId: string; campos: Campo[]; registros: Registro[]; puedeEditar: boolean; puedeEliminar?: boolean }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [editando, setEditando] = useState<Registro | null>(null)
  const [borrando, setBorrando] = useState<Registro | null>(null)
  const columnas = campos.filter((c) => c.mostrarEnTabla)

  function formato(c: Campo, valor: unknown): string {
    if (valor == null || valor === '') return '—'
    if (c.tipo === 'MONEDA') return fmtCOP(Number(valor))
    if (c.tipo === 'FECHA') return formatFechaCorta(new Date(String(valor)))
    if (c.tipo === 'SI_NO') return valor ? 'Sí' : 'No'
    return String(valor)
  }
  /** Cómo se nombra un registro en el diálogo de borrar: sus primeras columnas. */
  const resumen = (r: Registro) => columnas.slice(0, 3).map((c) => formato(c, r.datos[c.clave])).filter((v) => v !== '—').join(' · ') || 'Registro'

  return (
    <div className="space-y-4">
      {puedeEditar && <div className="flex justify-end"><Button size="sm" onClick={() => setAbierto(true)}><Plus className="size-4" /> Nuevo registro</Button></div>}
      {registros.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Sin registros.</CardContent></Card>
      ) : (
        <Card><CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted"><tr>
              {columnas.map((c) => <th key={c.clave} className="p-3 text-left font-medium">{c.etiqueta}</th>)}
              {(puedeEditar || puedeEliminar) && <th className="w-24 p-3" />}
            </tr></thead>
            <tbody>
              {registros.map((r) => (
                <tr key={r.id} className="border-t">
                  {columnas.map((c) => <td key={c.clave} className="p-3">{formato(c, r.datos[c.clave])}</td>)}
                  {(puedeEditar || puedeEliminar) && (
                    <td className="p-1.5 text-right whitespace-nowrap">
                      {puedeEditar && (
                        <Button size="icon" variant="ghost" className="size-8" onClick={() => setEditando(r)} aria-label="Editar registro" title="Editar"><Pencil className="size-4" /></Button>
                      )}
                      {puedeEliminar && (
                        <Button size="icon" variant="ghost" className="size-8 text-destructive" onClick={() => setBorrando(r)} aria-label="Eliminar registro" title="Eliminar"><Trash2 className="size-4" /></Button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent></Card>
      )}
      {abierto && <DialogRegistro moduloId={moduloId} campos={campos} onClose={() => setAbierto(false)} />}
      {editando && <DialogRegistro moduloId={moduloId} campos={campos} inicial={editando} onClose={() => setEditando(null)} />}
      {borrando && (
        <DialogMotivo
          titulo="Eliminar registro"
          resumen={`${resumen(borrando)}. No se puede deshacer.`}
          placeholder="¿Por qué se elimina?"
          onClose={() => setBorrando(null)}
          onConfirmar={async (motivo) => {
            const res = await eliminarRegistro({ id: borrando.id, motivo })
            if (res.ok) { toast.success('Registro eliminado.'); router.refresh(); return true }
            toast.error(res.error, { duration: 8000 })
            return false
          }}
        />
      )}
    </div>
  )
}

/** Crear (sin `inicial`) o editar un registro con los campos del módulo. */
function DialogRegistro({ moduloId, campos, inicial, onClose }: { moduloId: string; campos: Campo[]; inicial?: Registro; onClose: () => void }) {
  const router = useRouter()
  const [datos, setDatos] = useState<Record<string, unknown>>(inicial?.datos ?? {})
  const [g, setG] = useState(false)
  const set = (k: string, v: unknown) => setDatos((p) => ({ ...p, [k]: v }))
  const texto = (k: string) => { const v = datos[k]; return v == null ? '' : String(v) }

  async function guardar() {
    for (const c of campos) if (c.requerido && (datos[c.clave] == null || datos[c.clave] === '')) { toast.error(`El campo "${c.etiqueta}" es requerido.`); return }
    setG(true)
    const res = inicial ? await editarRegistro({ id: inicial.id, datos }) : await agregarRegistro({ moduloId, datos })
    setG(false)
    if (res.ok) { toast.success(inicial ? 'Registro actualizado.' : 'Registro agregado.'); onClose(); router.refresh() } else toast.error(res.error)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !g && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{inicial ? 'Editar registro' : 'Nuevo registro'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {campos.map((c) => (
            <div key={c.clave} className="space-y-1.5">
              <Label>{c.etiqueta}{c.requerido && <span className="text-destructive"> *</span>}</Label>
              {c.tipo === 'TEXTO_LARGO' ? <Textarea rows={2} value={texto(c.clave)} onChange={(e) => set(c.clave, e.target.value)} />
                : c.tipo === 'NUMERO' || c.tipo === 'DECIMAL' || c.tipo === 'MONEDA' ? <Input type="number" value={texto(c.clave)} onChange={(e) => set(c.clave, e.target.value === '' ? '' : Number(e.target.value))} />
                : c.tipo === 'FECHA' ? <Input type="date" value={texto(c.clave)} onChange={(e) => set(c.clave, e.target.value)} />
                : c.tipo === 'SI_NO' ? <label className="flex items-center gap-2 text-sm"><Checkbox checked={Boolean(datos[c.clave])} onCheckedChange={(v) => set(c.clave, Boolean(v))} /> Sí</label>
                : c.tipo === 'OPCION' ? (
                  <Select value={texto(c.clave) || undefined} onValueChange={(v) => set(c.clave, v)}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                    <SelectContent>{(c.opciones ?? '').split(',').map((o) => o.trim()).filter(Boolean).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select>
                )
                : <Input value={texto(c.clave)} onChange={(e) => set(c.clave, e.target.value)} />}
            </div>
          ))}
        </div>
        <DialogFooter><Button variant="ghost" onClick={onClose} disabled={g}>Cancelar</Button><Button onClick={guardar} disabled={g}>{g && <Spinner />}Guardar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
