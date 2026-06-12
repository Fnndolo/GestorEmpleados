'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { empresaSchema, type EmpresaInput } from '@/lib/validaciones/catalogos'
import { guardarEmpresa } from './acciones'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent } from '@/components/ui/card'

export function EmpresaForm({ valores }: { valores: EmpresaInput }) {
  const [guardando, setGuardando] = useState(false)
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<EmpresaInput>({ resolver: zodResolver(empresaSchema), defaultValues: valores })

  async function onSubmit(datos: EmpresaInput) {
    setGuardando(true)
    const res = await guardarEmpresa(datos)
    setGuardando(false)
    if (res.ok) toast.success('Datos de la empresa guardados.')
    else toast.error(res.error)
  }

  const sabadoHabil = watch('sabadoHabil')

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2 py-6">
          <Campo label="Razón social" error={errors.razonSocial?.message}>
            <Input {...register('razonSocial')} />
          </Campo>
          <Campo label="Nombre comercial" error={errors.nombreComercial?.message}>
            <Input {...register('nombreComercial')} />
          </Campo>
          <Campo label="NIT" error={errors.nit?.message}>
            <Input {...register('nit')} />
          </Campo>
          <Campo label="Representante legal" error={errors.representanteLegal?.message}>
            <Input {...register('representanteLegal')} />
          </Campo>
          <Campo label="Correo de contacto" error={errors.emailContacto?.message}>
            <Input type="email" {...register('emailContacto')} />
          </Campo>
          <Campo label="Teléfono" error={errors.telefono?.message}>
            <Input {...register('telefono')} />
          </Campo>
          <Campo label="Dirección" error={errors.direccion?.message} full>
            <Input {...register('direccion')} />
          </Campo>
          <Campo label="Sitio web" error={errors.sitioWeb?.message} full>
            <Input {...register('sitioWeb')} placeholder="https://" />
          </Campo>
          <div className="sm:col-span-2 flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Contar el sábado como día hábil</p>
              <p className="text-xs text-muted-foreground">
                Afecta el cálculo de días hábiles en las alertas de vencimiento.
              </p>
            </div>
            <Switch checked={sabadoHabil} onCheckedChange={(v) => setValue('sabadoHabil', v)} />
          </div>
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <Button type="submit" disabled={guardando}>
          {guardando && <Spinner />}
          Guardar cambios
        </Button>
      </div>
    </form>
  )
}

function Campo({
  label,
  error,
  full,
  children,
}: {
  label: string
  error?: string
  full?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={`space-y-1.5 ${full ? 'sm:col-span-2' : ''}`}>
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
