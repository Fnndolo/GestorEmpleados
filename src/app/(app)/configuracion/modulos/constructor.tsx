'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Trash2, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { crearModulo } from './acciones'

const TIPOS = [
  { v: 'TEXTO', l: 'Texto' }, { v: 'TEXTO_LARGO', l: 'Texto largo' }, { v: 'NUMERO', l: 'Número' },
  { v: 'DECIMAL', l: 'Decimal' }, { v: 'MONEDA', l: 'Moneda' }, { v: 'FECHA', l: 'Fecha' },
  { v: 'OPCION', l: 'Lista de opciones' }, { v: 'SI_NO', l: 'Sí / No' }, { v: 'COLABORADOR', l: 'Colaborador' },
]

type Campo = { etiqueta: string; tipo: string; requerido: boolean; opciones: string; generaAlerta: boolean }

export function Constructor() {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState('')
  const [vinculo, setVinculo] = useState('GLOBAL')
  const [campos, setCampos] = useState<Campo[]>([{ etiqueta: '', tipo: 'TEXTO', requerido: false, opciones: '', generaAlerta: false }])
  const [g, setG] = useState(false)

  function setCampo(i: number, patch: Partial<Campo>) { setCampos((c) => c.map((x, idx) => idx === i ? { ...x, ...patch } : x)) }

  async function crear() {
    const validos = campos.filter((c) => c.etiqueta.trim())
    if (!nombre.trim() || validos.length === 0) { toast.error('Indica el nombre y al menos un campo.'); return }
    setG(true)
    const res = await crearModulo({
      nombre, icono: 'Layers', seccion: 'Personalizados', vinculo: vinculo as 'GLOBAL',
      campos: validos.map((c) => ({ clave: c.etiqueta, etiqueta: c.etiqueta, tipo: c.tipo as 'TEXTO', requerido: c.requerido, opciones: c.opciones, generaAlerta: c.tipo === 'FECHA' ? c.generaAlerta : false })),
    })
    setG(false)
    if (res.ok) { toast.success('Módulo creado.'); setAbierto(false); router.push(`/modulos/${(res.datos as { slug: string }).slug}`) } else toast.error(res.error)
  }

  return (
    <>
      <Button size="sm" onClick={() => setAbierto(true)}><Plus className="size-4" /> Nuevo módulo</Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Layers className="size-5" /> Crear módulo personalizado</DialogTitle>
            <DialogDescription>Define el nombre y los campos. Aparecerá en el menú lateral.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Nombre del módulo</Label><Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Pólizas de vehículos…" /></div>
              <div className="space-y-1.5">
                <Label>Vínculo</Label>
                <Select value={vinculo} onValueChange={setVinculo}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GLOBAL">General (registros sueltos)</SelectItem>
                    <SelectItem value="POR_COLABORADOR">Por colaborador</SelectItem>
                    <SelectItem value="POR_SEDE">Por sede</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Campos</Label>
              {campos.map((c, i) => (
                <div key={i} className="rounded-lg border p-3 space-y-2">
                  <div className="flex gap-2">
                    <Input value={c.etiqueta} onChange={(e) => setCampo(i, { etiqueta: e.target.value })} placeholder="Nombre del campo" className="flex-1" />
                    <Select value={c.tipo} onValueChange={(v) => setCampo(i, { tipo: v })}>
                      <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>{TIPOS.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
                    </Select>
                    {campos.length > 1 && <Button variant="ghost" size="icon" onClick={() => setCampos((cs) => cs.filter((_, idx) => idx !== i))}><Trash2 className="size-4 text-destructive" /></Button>}
                  </div>
                  {c.tipo === 'OPCION' && <Input value={c.opciones} onChange={(e) => setCampo(i, { opciones: e.target.value })} placeholder="Opciones separadas por coma" />}
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-xs"><Checkbox checked={c.requerido} onCheckedChange={(v) => setCampo(i, { requerido: Boolean(v) })} /> Requerido</label>
                    {c.tipo === 'FECHA' && <label className="flex items-center gap-2 text-xs"><Checkbox checked={c.generaAlerta} onCheckedChange={(v) => setCampo(i, { generaAlerta: Boolean(v) })} /> Generar alerta de vencimiento</label>}
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setCampos((c) => [...c, { etiqueta: '', tipo: 'TEXTO', requerido: false, opciones: '', generaAlerta: false }])}>
                <Plus className="size-4" /> Agregar campo
              </Button>
            </div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button><Button onClick={crear} disabled={g}>{g && <Spinner />}Crear módulo</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
