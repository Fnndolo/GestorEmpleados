'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { z } from 'zod'
import { toast } from 'sonner'
import { Save } from 'lucide-react'
import { contratoOpsSchema, type ContratoOpsInput } from '@/lib/validaciones/contrato'

type OpsFormValues = z.input<typeof contratoOpsSchema>
import { crearContratoOps } from '../../ops-acciones'
import { SelectorColaborador } from '@/components/colaboradores/selector-colaborador'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function FormOps({ sedes }: { sedes: { id: string; nombre: string; ciudad: string }[] }) {
  const router = useRouter()
  const [guardando, setGuardando] = useState(false)
  const [nombres, setNombres] = useState({ colab: '', sup: '' })
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<OpsFormValues, unknown, ContratoOpsInput>({
    resolver: zodResolver(contratoOpsSchema),
    defaultValues: { colaboradorId: '', objeto: '', valorTotal: 0, supervisorId: '', sedeId: '', fechaInicio: '', fechaFin: '', rut: '' },
  })

  async function onSubmit(d: ContratoOpsInput) {
    setGuardando(true)
    const res = await crearContratoOps(d)
    setGuardando(false)
    if (res.ok) {
      toast.success('Contrato OPS creado.')
      router.push(`/contratos/ops/${(res.datos as { id: string }).id}`)
      router.refresh()
    } else toast.error(res.error)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Card><CardContent className="grid gap-4 sm:grid-cols-2 py-6">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Contratista</Label>
          <SelectorColaborador value={watch('colaboradorId')} onChange={(id, n) => { setValue('colaboradorId', id); setNombres((s) => ({ ...s, colab: n })) }} />
          {nombres.colab && <p className="text-xs text-muted-foreground">Seleccionado: {nombres.colab}</p>}
          {errors.colaboradorId && <p className="text-xs text-destructive">{errors.colaboradorId.message}</p>}
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Objeto del contrato</Label>
          <Textarea {...register('objeto')} rows={2} />
          {errors.objeto && <p className="text-xs text-destructive">{errors.objeto.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Valor total</Label>
          <Input type="number" {...register('valorTotal')} />
          {errors.valorTotal && <p className="text-xs text-destructive">{errors.valorTotal.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Valor mensual</Label>
          <Input type="number" {...register('valorMensual')} />
        </div>
        <div className="space-y-1.5">
          <Label>Sede</Label>
          <Select value={watch('sedeId')} onValueChange={(v) => setValue('sedeId', v)}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
            <SelectContent>{sedes.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre} · {s.ciudad}</SelectItem>)}</SelectContent>
          </Select>
          {errors.sedeId && <p className="text-xs text-destructive">{errors.sedeId.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>RUT</Label>
          <Input {...register('rut')} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Supervisor</Label>
          <SelectorColaborador value={watch('supervisorId')} onChange={(id, n) => { setValue('supervisorId', id); setNombres((s) => ({ ...s, sup: n })) }} placeholder="Selecciona el supervisor…" />
          {nombres.sup && <p className="text-xs text-muted-foreground">Supervisor: {nombres.sup}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Fecha de inicio</Label>
          <Input type="date" {...register('fechaInicio')} />
          {errors.fechaInicio && <p className="text-xs text-destructive">{errors.fechaInicio.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Fecha de fin</Label>
          <Input type="date" {...register('fechaFin')} />
          {errors.fechaFin && <p className="text-xs text-destructive">{errors.fechaFin.message}</p>}
        </div>
      </CardContent></Card>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>Cancelar</Button>
        <Button type="submit" disabled={guardando}>{guardando ? <Spinner /> : <Save className="size-4" />} Crear OPS</Button>
      </div>
    </form>
  )
}
