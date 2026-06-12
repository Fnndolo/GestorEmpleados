'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Plus, Trash2, GraduationCap } from 'lucide-react'
import { educacionSchema, type EducacionInput } from '@/lib/validaciones/colaborador'
import { agregarEducacion, eliminarEducacion } from '../acciones'
import { NIVEL_EDUCATIVO } from '@/lib/etiquetas'
import { formatFechaCorta } from '@/lib/fechas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type Educacion = {
  id: string; nivel: string; titulo: string; institucion: string
  fechaGrado: string | null; enCurso: boolean
}

export function EducacionLista({
  colaboradorId, items, puedeEditar,
}: {
  colaboradorId: string; items: Educacion[]; puedeEditar: boolean
}) {
  const router = useRouter()
  const [nuevo, setNuevo] = useState(false)

  return (
    <div className="space-y-3">
      {puedeEditar && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={() => setNuevo(true)}>
            <Plus className="size-4" /> Agregar estudio
          </Button>
        </div>
      )}
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center border rounded-lg border-dashed">
          Sin estudios registrados.
        </p>
      ) : (
        items.map((e) => (
          <Card key={e.id}>
            <CardContent className="flex items-center gap-3 py-3">
              <GraduationCap className="size-5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{e.titulo}</p>
                <p className="text-xs text-muted-foreground">
                  {NIVEL_EDUCATIVO[e.nivel]} · {e.institucion}
                  {e.enCurso ? ' · En curso' : e.fechaGrado ? ` · ${formatFechaCorta(new Date(e.fechaGrado))}` : ''}
                </p>
              </div>
              {puedeEditar && (
                <Button
                  variant="ghost" size="icon" aria-label="Eliminar"
                  onClick={async () => {
                    const res = await eliminarEducacion({ id: e.id, colaboradorId })
                    if (res.ok) { toast.success('Estudio eliminado.'); router.refresh() }
                    else toast.error(res.error)
                  }}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              )}
            </CardContent>
          </Card>
        ))
      )}
      {nuevo && <DialogEducacion colaboradorId={colaboradorId} onClose={() => setNuevo(false)} onGuardado={() => { setNuevo(false); router.refresh() }} />}
    </div>
  )
}

function DialogEducacion({
  colaboradorId, onClose, onGuardado,
}: { colaboradorId: string; onClose: () => void; onGuardado: () => void }) {
  const [guardando, setGuardando] = useState(false)
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<EducacionInput>({
    resolver: zodResolver(educacionSchema),
    defaultValues: { colaboradorId, nivel: 'PREGRADO', titulo: '', institucion: '', fechaGrado: '', enCurso: false },
  })

  async function onSubmit(d: EducacionInput) {
    setGuardando(true)
    const res = await agregarEducacion(d)
    setGuardando(false)
    if (res.ok) { toast.success('Estudio agregado.'); onGuardado() }
    else toast.error(res.error)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Agregar estudio</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nivel</Label>
            <Select defaultValue="PREGRADO" onValueChange={(v) => setValue('nivel', v as EducacionInput['nivel'])}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(NIVEL_EDUCATIVO).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input {...register('titulo')} />
            {errors.titulo && <p className="text-xs text-destructive">{errors.titulo.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Institución</Label>
            <Input {...register('institucion')} />
            {errors.institucion && <p className="text-xs text-destructive">{errors.institucion.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Fecha de grado</Label>
            <Input type="date" {...register('fechaGrado')} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={watch('enCurso')} onCheckedChange={(v) => setValue('enCurso', Boolean(v))} />
            En curso
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={guardando}>{guardando && <Spinner />}Agregar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
