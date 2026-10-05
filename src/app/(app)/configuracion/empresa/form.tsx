'use client'

import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Check, CircleAlert } from 'lucide-react'
import { empresaSchema, type EmpresaInput } from '@/lib/validaciones/catalogos'
import { guardarEmpresa } from './acciones'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent } from '@/components/ui/card'
import { Ayuda } from '@/components/ui-kit/ayuda'
import { cn } from '@/lib/utils'

type Estado = 'quieto' | 'guardando' | 'guardado' | 'error'

/**
 * Datos de la empresa con guardado automático: cada campo se guarda al salir
 * de él (y los interruptores al cambiarlos), sin botón de guardar. Arriba, un
 * aviso discreto dice si quedó guardado.
 */
export function EmpresaForm({ valores, puedeEditar = true }: { valores: EmpresaInput; puedeEditar?: boolean }) {
  const [estado, setEstado] = useState<Estado>('quieto')
  const guardado = useRef<EmpresaInput>(valores)
  // Las guardadas van en fila: si se sale rápido de dos campos, no se pisan.
  const cola = useRef<Promise<void>>(Promise.resolve())
  const { register, setValue, getValues, trigger, watch, formState: { errors } } =
    useForm<EmpresaInput>({ resolver: zodResolver(empresaSchema), defaultValues: valores, mode: 'onBlur' })

  function autoguardar(campo: keyof EmpresaInput) {
    if (!puedeEditar) return
    cola.current = cola.current.then(async () => {
      // Se valida todo: si otro campo tiene error, no se guarda (el error ya se ve en su campo).
      await trigger(campo)
      if (!(await trigger())) return
      const datos = getValues()
      if (JSON.stringify(datos) === JSON.stringify(guardado.current)) return
      setEstado('guardando')
      const res = await guardarEmpresa(datos)
      if (res.ok) { guardado.current = datos; setEstado('guardado') }
      else { setEstado('error'); toast.error(res.error) }
    })
  }
  const campo = (nombre: keyof EmpresaInput, opciones?: { valueAsNumber?: boolean }) =>
    ({ id: `empresa-${nombre}`, ...register(nombre, { ...opciones, onBlur: () => autoguardar(nombre) } as Parameters<typeof register>[1]) })

  const sabadoHabil = watch('sabadoHabil')

  return (
    <Card className="py-0">
      {/* Columnas según el ancho del formulario (container queries), no de la ventana. */}
      <CardContent className="@container divide-y p-0">
        <Seccion
          titulo="Empresa"
          ayuda="Estos datos encabezan contratos, certificaciones, actas y desprendibles. Los documentos ya emitidos conservan los datos con que se firmaron."
          extra={<EstadoGuardado estado={estado} />}
        >
          <Campo label="Razón social" para="empresa-razonSocial" error={errors.razonSocial?.message}><Input {...campo('razonSocial')} disabled={!puedeEditar} /></Campo>
          <Campo label="Nombre comercial" para="empresa-nombreComercial" error={errors.nombreComercial?.message}><Input {...campo('nombreComercial')} disabled={!puedeEditar} /></Campo>
          <Campo label="NIT" para="empresa-nit" error={errors.nit?.message}><Input {...campo('nit')} inputMode="numeric" disabled={!puedeEditar} /></Campo>
        </Seccion>
        <Seccion titulo="Representante legal" ayuda="Firma los contratos; su nombre y cédula salen en ellos.">
          <Campo label="Nombre" para="empresa-representanteLegal" error={errors.representanteLegal?.message}><Input {...campo('representanteLegal')} disabled={!puedeEditar} /></Campo>
          <Campo label="Cédula" para="empresa-representanteLegalCc" error={errors.representanteLegalCc?.message}><Input {...campo('representanteLegalCc')} inputMode="numeric" disabled={!puedeEditar} /></Campo>
        </Seccion>
        <Seccion titulo="Contacto">
          <Campo label="Correo" para="empresa-emailContacto" error={errors.emailContacto?.message}><Input type="email" inputMode="email" {...campo('emailContacto')} disabled={!puedeEditar} /></Campo>
          <Campo label="Teléfono" para="empresa-telefono" error={errors.telefono?.message}><Input type="tel" inputMode="tel" {...campo('telefono')} disabled={!puedeEditar} /></Campo>
          <Campo label="Dirección" para="empresa-direccion" error={errors.direccion?.message}><Input {...campo('direccion')} disabled={!puedeEditar} /></Campo>
          <Campo label="Sitio web" para="empresa-sitioWeb" error={errors.sitioWeb?.message}><Input type="url" inputMode="url" {...campo('sitioWeb')} placeholder="https://" disabled={!puedeEditar} /></Campo>
        </Seccion>
        <Seccion titulo="Reglas">
          <Ajuste titulo="Sábado hábil" nota="Cuenta en plazos y vencimientos." ayuda="Si está encendido, el sábado se cuenta como día hábil al calcular plazos legales, vencimientos y alertas.">
            <Switch
              checked={sabadoHabil} disabled={!puedeEditar} aria-label="Contar el sábado como día hábil"
              onCheckedChange={(v) => { setValue('sabadoHabil', v); autoguardar('sabadoHabil') }}
            />
          </Ajuste>
          <Ajuste
            titulo="Plazo del comprobante" nota="Días para subir la constancia de un permiso."
            ayuda="Días hábiles, contados desde el día del permiso, que tiene el colaborador para subir la constancia de que asistió a la cita o diligencia. Con 0 debe subirla el mismo día."
            error={errors.plazoComprobantePermisoDias?.message}
          >
            <span className="flex items-center gap-1.5">
              <Input
                type="number" min={0} max={60} step={1} inputMode="numeric" aria-label="Días hábiles de plazo" disabled={!puedeEditar}
                className="w-16 text-center tabular-nums"
                {...campo('plazoComprobantePermisoDias', { valueAsNumber: true })}
              />
              <span className="text-sm text-muted-foreground">días</span>
            </span>
          </Ajuste>
        </Seccion>
      </CardContent>
    </Card>
  )
}

function EstadoGuardado({ estado }: { estado: Estado }) {
  if (estado === 'quieto') return <span className="text-xs text-muted-foreground max-sm:hidden">Se guarda solo</span>
  return (
    <span aria-live="polite" className={cn('inline-flex items-center gap-1 text-xs', estado === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
      {estado === 'guardando' ? <><Spinner className="size-3" /> Guardando…</>
        : estado === 'guardado' ? <><Check className="size-3.5 text-emerald-600" /> Guardado</>
          : <><CircleAlert className="size-3.5" /> No se guardó</>}
    </span>
  )
}

/** Un grupo de campos con su título; la explicación, si la hay, detrás del ⓘ. */
function Seccion({ titulo, ayuda, extra, children }: { titulo: string; ayuda?: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3 p-4 sm:p-5">
      <div className="flex items-center gap-1.5">
        <h2 className="text-sm font-semibold">{titulo}</h2>
        {ayuda && <Ayuda texto={ayuda} etiqueta={`Sobre ${titulo.toLowerCase()}`} />}
        {extra && <span className="ml-auto">{extra}</span>}
      </div>
      <div className="grid grid-cols-1 gap-3 @xl:grid-cols-2 @4xl:grid-cols-3">{children}</div>
    </section>
  )
}

/** Un ajuste en una fila: título, una línea de nota (con ⓘ si hay más) y su control a la derecha. */
function Ajuste({ titulo, nota, ayuda, error, children }: { titulo: string; nota: string; ayuda?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg border p-3 @xl:col-span-2 @4xl:col-span-3">
      <div className="min-w-0">
        <p className="flex items-center gap-1 text-sm font-medium">{titulo}{ayuda && <Ayuda texto={ayuda} etiqueta={`Sobre ${titulo.toLowerCase()}`} />}</p>
        <p className="truncate text-xs text-muted-foreground">{nota}</p>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Campo({
  label,
  para,
  error,
  className,
  children,
}: {
  label: string
  /** id del input: el rótulo queda asociado (y tocarlo enfoca el campo). */
  para: string
  error?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={para}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
