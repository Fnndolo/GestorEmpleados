'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, FileText, Star, ImagePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { crearPlantillaCC, editarPlantillaCC, eliminarPlantillaCC } from './acciones'

type Plantilla = { id: string; nombre: string; encabezado: string | null; cuerpo: string; pieLegal: string | null; esDefecto: boolean; tieneLogo: boolean }

const CUERPO_EJEMPLO = 'Por concepto de {{concepto}} correspondiente al periodo {{periodo}}, por valor de {{valor}}. Declaro que me encuentro al día en el pago de mis aportes a seguridad social como trabajador independiente.'

export function PlantillasCliente({ plantillas }: { plantillas: Plantilla[] }) {
  const [editar, setEditar] = useState<Plantilla | null>(null)
  const [nueva, setNueva] = useState(false)
  const [eliminar, setEliminar] = useState<Plantilla | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button size="sm" onClick={() => setNueva(true)}><Plus className="size-4" /> Nueva plantilla</Button></div>
      {plantillas.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground"><FileText className="size-8" /><p>Aún no hay plantillas. Crea la primera.</p></CardContent></Card>
      ) : (
        <Card><CardContent className="p-0 divide-y">
          {plantillas.map((p) => (
            <div key={p.id} className="flex items-center gap-3 p-3">
              <FileText className="size-5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm flex items-center gap-1.5">{p.nombre}{p.esDefecto && <Star className="size-3.5 fill-amber-400 text-amber-400" />}{p.tieneLogo && <Badge variant="outline" className="text-[10px]">Con logo</Badge>}</p>
                <p className="text-xs text-muted-foreground truncate">{p.cuerpo}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setEditar(p)} aria-label="Editar"><Pencil className="size-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => setEliminar(p)} aria-label="Eliminar"><Trash2 className="size-4 text-destructive" /></Button>
            </div>
          ))}
        </CardContent></Card>
      )}

      {(nueva || editar) && <DialogPlantilla plantilla={editar} onClose={() => { setNueva(false); setEditar(null) }} />}
      {eliminar && (
        <AlertDialog open onOpenChange={(o) => !o && setEliminar(null)}>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>Eliminar «{eliminar.nombre}»</AlertDialogTitle><AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={async () => { const r = await eliminarPlantillaCC({ id: eliminar.id }); if (r.ok) toast.success('Plantilla eliminada.'); else toast.error(r.error); setEliminar(null) }}>Eliminar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}

function DialogPlantilla({ plantilla, onClose }: { plantilla: Plantilla | null; onClose: () => void }) {
  const router = useRouter()
  const inputLogo = useRef<HTMLInputElement>(null)
  const [nombre, setNombre] = useState(plantilla?.nombre ?? '')
  const [encabezado, setEncabezado] = useState(plantilla?.encabezado ?? '')
  const [cuerpo, setCuerpo] = useState(plantilla?.cuerpo ?? CUERPO_EJEMPLO)
  const [pieLegal, setPieLegal] = useState(plantilla?.pieLegal ?? '')
  const [esDefecto, setEsDefecto] = useState(plantilla?.esDefecto ?? false)
  const [logo, setLogo] = useState<File | null>(null)
  const [g, setG] = useState(false)

  async function guardar() {
    setG(true)
    const datos = { nombre, encabezado, cuerpo, pieLegal, esDefecto }
    const res = plantilla ? await editarPlantillaCC({ id: plantilla.id, ...datos }) : await crearPlantillaCC(datos)
    if (!res.ok) { setG(false); toast.error(res.error); return }
    const id = plantilla ? plantilla.id : (res.datos as { id: string }).id
    if (logo) {
      try { const fd = new FormData(); fd.append('archivo', logo); await fetch(`/api/plantillas-cuenta-cobro/${id}/logo`, { method: 'POST', body: fd }) } catch { /* opcional */ }
    }
    setG(false); toast.success(plantilla ? 'Plantilla actualizada.' : 'Plantilla creada.'); onClose(); router.refresh()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{plantilla ? 'Editar plantilla' : 'Nueva plantilla'}</DialogTitle>
          <DialogDescription>Variables disponibles: {'{{contratista}}'}, {'{{documento}}'}, {'{{valor}}'}, {'{{periodo}}'}, {'{{concepto}}'}, {'{{empresa}}'}, {'{{nit}}'}, {'{{ciudad}}'}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>Nombre</Label><Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Días laborados / Bonos / Servicios…" /></div>
          <div className="space-y-1.5">
            <Label>Logo (opcional)</Label>
            <input ref={inputLogo} type="file" accept="image/*" className="hidden" onChange={(e) => setLogo(e.target.files?.[0] ?? null)} />
            <Button type="button" variant="outline" size="sm" className="w-full justify-start" onClick={() => inputLogo.current?.click()}>
              <ImagePlus className="size-4" /> {logo ? logo.name : plantilla?.tieneLogo ? 'Cambiar logo' : 'Subir logo'}
            </Button>
          </div>
          <div className="space-y-1.5"><Label>Encabezado (opcional)</Label><Textarea rows={2} value={encabezado} onChange={(e) => setEncabezado(e.target.value)} placeholder="Señores {{empresa}}, ciudad…" /></div>
          <div className="space-y-1.5"><Label>Cuerpo</Label><Textarea rows={4} value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Pie / texto legal (opcional)</Label><Textarea rows={2} value={pieLegal} onChange={(e) => setPieLegal(e.target.value)} /></div>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={esDefecto} onCheckedChange={(v) => setEsDefecto(Boolean(v))} /> Usar como plantilla por defecto</label>
        </div>
        <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={guardar} disabled={g || nombre.length < 2}>{g && <Spinner />}Guardar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
