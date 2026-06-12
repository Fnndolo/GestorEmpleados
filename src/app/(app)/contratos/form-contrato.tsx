'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { z } from 'zod'
import { toast } from 'sonner'
import { Save } from 'lucide-react'
import { contratoSchema, type ContratoInput } from '@/lib/validaciones/contrato'

type ContratoFormValues = z.input<typeof contratoSchema>
import { crearContrato } from './acciones'
import { SelectorColaborador } from '@/components/colaboradores/selector-colaborador'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type Cat = { sedes: { id: string; nombre: string; ciudad: string }[]; cargos: { id: string; nombre: string }[] }

const TIPOS = [
  { v: 'TERMINO_INDEFINIDO', l: 'Término indefinido' },
  { v: 'TERMINO_FIJO', l: 'Término fijo' },
  { v: 'OBRA_LABOR', l: 'Obra o labor' },
  { v: 'APRENDIZAJE_SENA', l: 'Aprendizaje SENA' },
  { v: 'PRACTICA', l: 'Práctica' },
]

export function FormContrato({ catalogos }: { catalogos: Cat }) {
  const router = useRouter()
  const [guardando, setGuardando] = useState(false)
  const [nombreColab, setNombreColab] = useState('')
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<ContratoFormValues, unknown, ContratoInput>({
    resolver: zodResolver(contratoSchema),
    defaultValues: {
      colaboradorId: '', tipo: 'TERMINO_INDEFINIDO', cargoId: '', sedeId: '', jornada: 'TIEMPO_COMPLETO',
      modalidadTrabajo: 'PRESENCIAL', salarioBase: 0, tipoSalario: 'ORDINARIO',
      fechaInicio: '', fechaFin: '', objetoObraLabor: '', etapaAprendizaje: '', observaciones: '',
    },
  })
  const tipo = watch('tipo')

  async function onSubmit(d: ContratoInput) {
    setGuardando(true)
    const res = await crearContrato(d)
    setGuardando(false)
    if (res.ok) {
      toast.success('Contrato creado.')
      router.push(`/contratos/${(res.datos as { id: string }).id}`)
      router.refresh()
    } else toast.error(res.error)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Card><CardContent className="grid gap-4 sm:grid-cols-2 py-6">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Colaborador</Label>
          <SelectorColaborador value={watch('colaboradorId')} onChange={(id, n) => { setValue('colaboradorId', id); setNombreColab(n) }} />
          {nombreColab && <p className="text-xs text-muted-foreground">Seleccionado: {nombreColab}</p>}
          {errors.colaboradorId && <p className="text-xs text-destructive">{errors.colaboradorId.message}</p>}
        </div>
        <Campo label="Tipo de contrato">
          <Select value={tipo} onValueChange={(v) => setValue('tipo', v as ContratoInput['tipo'])}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{TIPOS.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
          </Select>
        </Campo>
        <Campo label="Modalidad de trabajo">
          <Select value={watch('modalidadTrabajo')} onValueChange={(v) => setValue('modalidadTrabajo', v as ContratoInput['modalidadTrabajo'])}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="PRESENCIAL">Presencial</SelectItem>
              <SelectItem value="REMOTO">Remoto</SelectItem>
              <SelectItem value="HIBRIDO">Híbrido</SelectItem>
              <SelectItem value="TELETRABAJO">Teletrabajo</SelectItem>
            </SelectContent>
          </Select>
        </Campo>
        <Campo label="Sede" error={errors.sedeId?.message}>
          <Select value={watch('sedeId')} onValueChange={(v) => setValue('sedeId', v)}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
            <SelectContent>{catalogos.sedes.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre} · {s.ciudad}</SelectItem>)}</SelectContent>
          </Select>
        </Campo>
        <Campo label="Cargo">
          <Select value={watch('cargoId') || undefined} onValueChange={(v) => setValue('cargoId', v)}>
            <SelectTrigger className="w-full"><SelectValue placeholder="— Sin definir —" /></SelectTrigger>
            <SelectContent>{catalogos.cargos.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
          </Select>
        </Campo>
        <Campo label="Salario base" error={errors.salarioBase?.message}>
          <Input type="number" step="1" {...register('salarioBase')} />
        </Campo>
        <Campo label="Tipo de salario">
          <Select value={watch('tipoSalario')} onValueChange={(v) => setValue('tipoSalario', v as ContratoInput['tipoSalario'])}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ORDINARIO">Ordinario</SelectItem>
              <SelectItem value="INTEGRAL">Integral</SelectItem>
            </SelectContent>
          </Select>
        </Campo>
        <Campo label="Jornada">
          <Select value={watch('jornada')} onValueChange={(v) => setValue('jornada', v as ContratoInput['jornada'])}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="TIEMPO_COMPLETO">Tiempo completo</SelectItem>
              <SelectItem value="MEDIO_TIEMPO">Medio tiempo</SelectItem>
              <SelectItem value="POR_DIAS">Por días</SelectItem>
            </SelectContent>
          </Select>
        </Campo>
        <Campo label="Horas semanales">
          <Input type="number" {...register('horasSemanales')} placeholder="42" />
        </Campo>
        <Campo label="Fecha de inicio" error={errors.fechaInicio?.message}>
          <Input type="date" {...register('fechaInicio')} />
        </Campo>
        {tipo === 'TERMINO_FIJO' && (
          <Campo label="Fecha de fin (término fijo)">
            <Input type="date" {...register('fechaFin')} />
          </Campo>
        )}
        <Campo label="Días de periodo de prueba">
          <Input type="number" {...register('periodoPruebaDias')} placeholder="60" />
        </Campo>
        {tipo === 'OBRA_LABOR' && (
          <Campo label="Objeto de la obra o labor" full>
            <Textarea {...register('objetoObraLabor')} rows={2} />
          </Campo>
        )}
        {tipo === 'APRENDIZAJE_SENA' && (
          <Campo label="Etapa de aprendizaje">
            <Select value={watch('etapaAprendizaje') || undefined} onValueChange={(v) => setValue('etapaAprendizaje', v as 'LECTIVA')}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="LECTIVA">Lectiva</SelectItem>
                <SelectItem value="PRODUCTIVA">Productiva</SelectItem>
              </SelectContent>
            </Select>
          </Campo>
        )}
        <Campo label="Observaciones" full>
          <Textarea {...register('observaciones')} rows={2} />
        </Campo>
      </CardContent></Card>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>Cancelar</Button>
        <Button type="submit" disabled={guardando}>{guardando ? <Spinner /> : <Save className="size-4" />} Crear contrato</Button>
      </div>
    </form>
  )
}

function Campo({ label, error, full, children }: { label: string; error?: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={`space-y-1.5 ${full ? 'sm:col-span-2' : ''}`}>
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
