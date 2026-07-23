'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, type UseFormRegister } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Save } from 'lucide-react'
import { colaboradorSchema, type ColaboradorInput } from '@/lib/validaciones/colaborador'
import { crearColaborador, editarColaborador } from './acciones'
import type { CatalogosColaborador } from '@/server/consultas/catalogos'
import {
  TIPO_DOCUMENTO_IDENTIDAD, GENERO, ESTADO_CIVIL, GRUPO_SANGUINEO, NIVEL_EDUCATIVO,
  TIPO_CUENTA, TIPO_VINCULO, MODALIDAD_TRABAJO, ESTADO_COLABORADOR, CLASE_RIESGO_ARL,
} from '@/lib/etiquetas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type Props = {
  catalogos: CatalogosColaborador
  valores?: Partial<ColaboradorInput> & { id?: string }
  puedeEditarSalud: boolean
}

const opcionesDe = (record: Record<string, string>) =>
  Object.entries(record).map(([valor, etiqueta]) => ({ valor, etiqueta }))

export function FormColaborador({ catalogos, valores, puedeEditarSalud }: Props) {
  const router = useRouter()
  const esEdicion = Boolean(valores?.id)
  const [guardando, setGuardando] = useState(false)

  const form = useForm<ColaboradorInput>({
    resolver: zodResolver(colaboradorSchema),
    defaultValues: {
      tipoDocumento: 'CC', numeroDocumento: '', fechaExpedicionDoc: '', lugarExpedicionDoc: '',
      nombres: '', apellidos: '', fechaNacimiento: '', lugarNacimiento: '', genero: '', estadoCivil: '',
      grupoSanguineo: '', direccion: '', barrio: '', ciudadResidenciaId: '', celular: '', telefono: '',
      emailPersonal: '', emailCorporativo: '', emergenciaNombre: '', emergenciaParentesco: '',
      emergenciaTelefono: '', nivelEducativoMax: '', epsId: '', afpId: '', fondoCesantiasId: '',
      cajaCompensacionId: '', arlId: '', claseRiesgoArl: '', bancoId: '', tipoCuenta: '', numeroCuenta: '',
      tipoVinculo: 'TERMINO_INDEFINIDO', sedeId: '', areaId: '', cargoId: '', jefeInmediatoId: '',
      modalidadTrabajo: 'PRESENCIAL', fechaIngreso: '', estado: 'ACTIVO',
      tallaCamisa: '', tallaPantalon: '', tallaCalzado: '',
      ...valores,
    },
  })
  const { register, handleSubmit, setValue, watch, formState: { errors } } = form

  const areaSeleccionada = watch('areaId')
  const cargosFiltrados = areaSeleccionada
    ? catalogos.cargos.filter((c) => c.areaId === areaSeleccionada)
    : catalogos.cargos

  async function onSubmit(datos: ColaboradorInput) {
    setGuardando(true)
    const res = esEdicion
      ? await editarColaborador({ ...datos, id: valores!.id! })
      : await crearColaborador(datos)
    setGuardando(false)
    if (res.ok) {
      if (esEdicion) {
        toast.success('Colaborador actualizado.')
      } else {
        const d = res.datos as { id: string; usuarioCreado?: boolean; sinCorreo?: boolean; correoYaTeniaUsuario?: boolean }
        if (d.usuarioCreado) toast.success('Colaborador creado. Se creó su usuario y se le envió la invitación por correo.')
        else if (d.correoYaTeniaUsuario) toast.warning('Colaborador creado, pero ese correo YA tiene un usuario en el sistema: no se creó cuenta nueva ni se envió invitación. Usa un correo distinto si es otra persona.', { duration: 9000 })
        else if (d.sinCorreo) toast.success('Colaborador creado. No tiene correo: no se creó usuario de acceso (puedes crearlo luego en Usuarios).')
        else toast.warning('Colaborador creado, pero no se pudo crear su usuario de acceso. Revisa el correo o créalo luego en Usuarios.')
      }
      const id = esEdicion ? valores!.id! : (res.datos as { id: string }).id
      router.push(`/colaboradores/${id}`)
      router.refresh()
    } else {
      toast.error(res.error)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 pb-4">
      {/* Identificación */}
      <Seccion titulo="Identificación">
        <CampoSelect label="Tipo de documento" valor={watch('tipoDocumento')} opciones={opcionesDe(TIPO_DOCUMENTO_IDENTIDAD)} onChange={(v) => setValue('tipoDocumento', v as ColaboradorInput['tipoDocumento'])} />
        <CampoTexto label="Número de documento" reg={register('numeroDocumento')} err={errors.numeroDocumento?.message} />
        <CampoFecha label="Fecha de expedición" reg={register('fechaExpedicionDoc')} />
        <CampoTexto label="Lugar de expedición" reg={register('lugarExpedicionDoc')} />
        <CampoTexto label="Nombres" reg={register('nombres')} err={errors.nombres?.message} />
        <CampoTexto label="Apellidos" reg={register('apellidos')} err={errors.apellidos?.message} />
        <CampoFecha label="Fecha de nacimiento" reg={register('fechaNacimiento')} />
        <CampoTexto label="Lugar de nacimiento" reg={register('lugarNacimiento')} />
        <CampoSelect label="Género" valor={watch('genero') ?? ''} opciones={opcionesDe(GENERO)} onChange={(v) => setValue('genero', v as ColaboradorInput['genero'])} opcional />
        <CampoSelect label="Estado civil" valor={watch('estadoCivil') ?? ''} opciones={opcionesDe(ESTADO_CIVIL)} onChange={(v) => setValue('estadoCivil', v as ColaboradorInput['estadoCivil'])} opcional />
        <CampoSelect label="Grupo sanguíneo (RH)" valor={watch('grupoSanguineo') ?? ''} opciones={opcionesDe(GRUPO_SANGUINEO)} onChange={(v) => setValue('grupoSanguineo', v as ColaboradorInput['grupoSanguineo'])} opcional />
      </Seccion>

      {/* Contacto */}
      <Seccion titulo="Contacto">
        <CampoTexto label="Celular" reg={register('celular')} err={errors.celular?.message} />
        <CampoTexto label="Teléfono fijo" reg={register('telefono')} />
        <CampoTexto label="Correo personal * (ahí llegan sus credenciales de acceso)" reg={register('emailPersonal')} err={errors.emailPersonal?.message} />
        <CampoTexto label="Correo corporativo" reg={register('emailCorporativo')} err={errors.emailCorporativo?.message} />
        <CampoTexto label="Dirección" reg={register('direccion')} full />
        <CampoTexto label="Barrio" reg={register('barrio')} />
        <CampoSelect label="Ciudad de residencia" valor={watch('ciudadResidenciaId') ?? ''} opciones={catalogos.ciudades.map((c) => ({ valor: c.id, etiqueta: `${c.nombre} · ${c.departamento}` }))} onChange={(v) => setValue('ciudadResidenciaId', v)} opcional />
      </Seccion>

      {/* Emergencia */}
      <Seccion titulo="Contacto de emergencia">
        <CampoTexto label="Nombre" reg={register('emergenciaNombre')} />
        <CampoTexto label="Parentesco" reg={register('emergenciaParentesco')} />
        <CampoTexto label="Teléfono" reg={register('emergenciaTelefono')} />
      </Seccion>

      {/* Laboral */}
      <Seccion titulo="Información laboral">
        <CampoSelect label="Tipo de vínculo" valor={watch('tipoVinculo')} opciones={opcionesDe(TIPO_VINCULO)} onChange={(v) => setValue('tipoVinculo', v as ColaboradorInput['tipoVinculo'])} />
        <CampoSelect label="Modalidad de trabajo" valor={watch('modalidadTrabajo')} opciones={opcionesDe(MODALIDAD_TRABAJO)} onChange={(v) => setValue('modalidadTrabajo', v as ColaboradorInput['modalidadTrabajo'])} />
        <CampoSelect label="Sede" valor={watch('sedeId')} opciones={catalogos.sedes.map((s) => ({ valor: s.id, etiqueta: `${s.nombre} · ${s.ciudad}` }))} onChange={(v) => setValue('sedeId', v)} err={errors.sedeId?.message} />
        <CampoSelect label="Área" valor={watch('areaId') ?? ''} opciones={catalogos.areas.map((a) => ({ valor: a.id, etiqueta: a.nombre }))} onChange={(v) => { setValue('areaId', v); setValue('cargoId', '') }} opcional />
        <CampoSelect label="Cargo" valor={watch('cargoId') ?? ''} opciones={cargosFiltrados.map((c) => ({ valor: c.id, etiqueta: c.nombre }))} onChange={(v) => setValue('cargoId', v)} opcional />
        <CampoSelect label="Jefe inmediato" valor={watch('jefeInmediatoId') ?? ''} opciones={catalogos.jefes.filter((j) => j.id !== valores?.id).map((j) => ({ valor: j.id, etiqueta: j.nombre }))} onChange={(v) => setValue('jefeInmediatoId', v)} opcional />
        <CampoFecha label="Fecha de ingreso" reg={register('fechaIngreso')} err={errors.fechaIngreso?.message} />
        <CampoSelect label="Estado" valor={watch('estado')} opciones={opcionesDe(ESTADO_COLABORADOR)} onChange={(v) => setValue('estado', v as ColaboradorInput['estado'])} />
      </Seccion>

      {/* Salud / seguridad social (sensible) */}
      {puedeEditarSalud && (
        <Seccion titulo="Seguridad social" nota="Información sensible (Ley 1581). Solo visible para perfiles autorizados.">
          <CampoSelect label="EPS" valor={watch('epsId') ?? ''} opciones={catalogos.eps.map((e) => ({ valor: e.id, etiqueta: e.nombre }))} onChange={(v) => setValue('epsId', v)} opcional />
          <CampoSelect label="Fondo de pensión (AFP)" valor={watch('afpId') ?? ''} opciones={catalogos.afp.map((e) => ({ valor: e.id, etiqueta: e.nombre }))} onChange={(v) => setValue('afpId', v)} opcional />
          <CampoSelect label="Fondo de cesantías" valor={watch('fondoCesantiasId') ?? ''} opciones={catalogos.fondosCesantias.map((e) => ({ valor: e.id, etiqueta: e.nombre }))} onChange={(v) => setValue('fondoCesantiasId', v)} opcional />
          <CampoSelect label="Caja de compensación" valor={watch('cajaCompensacionId') ?? ''} opciones={catalogos.cajas.map((e) => ({ valor: e.id, etiqueta: e.nombre }))} onChange={(v) => setValue('cajaCompensacionId', v)} opcional />
          <CampoSelect label="ARL" valor={watch('arlId') ?? ''} opciones={catalogos.arl.map((e) => ({ valor: e.id, etiqueta: e.nombre }))} onChange={(v) => setValue('arlId', v)} opcional />
          <CampoSelect label="Clase de riesgo ARL" valor={watch('claseRiesgoArl') ?? ''} opciones={opcionesDe(CLASE_RIESGO_ARL)} onChange={(v) => setValue('claseRiesgoArl', v as ColaboradorInput['claseRiesgoArl'])} opcional />
          <CampoSelect label="Nivel educativo máximo" valor={watch('nivelEducativoMax') ?? ''} opciones={opcionesDe(NIVEL_EDUCATIVO)} onChange={(v) => setValue('nivelEducativoMax', v as ColaboradorInput['nivelEducativoMax'])} opcional />
        </Seccion>
      )}

      {/* Bancarios */}
      <Seccion titulo="Datos bancarios">
        <CampoSelect label="Banco" valor={watch('bancoId') ?? ''} opciones={catalogos.bancos.map((b) => ({ valor: b.id, etiqueta: b.nombre }))} onChange={(v) => setValue('bancoId', v)} opcional />
        <CampoSelect label="Tipo de cuenta" valor={watch('tipoCuenta') ?? ''} opciones={opcionesDe(TIPO_CUENTA)} onChange={(v) => setValue('tipoCuenta', v as ColaboradorInput['tipoCuenta'])} opcional />
        <CampoTexto label="Número de cuenta" reg={register('numeroCuenta')} />
      </Seccion>

      {/* Dotación */}
      <Seccion titulo="Tallas para dotación">
        <CampoTexto label="Camisa" reg={register('tallaCamisa')} />
        <CampoTexto label="Pantalón" reg={register('tallaPantalon')} />
        <CampoTexto label="Calzado" reg={register('tallaCalzado')} />
      </Seccion>

      <div className="sticky bottom-16 lg:bottom-0 -mx-4 lg:mx-0 flex justify-end gap-2 border-t bg-background/95 p-3 backdrop-blur">
        <Button type="button" variant="ghost" onClick={() => router.back()}>Cancelar</Button>
        <Button type="submit" disabled={guardando}>
          {guardando ? <Spinner /> : <Save className="size-4" />} Guardar colaborador
        </Button>
      </div>
    </form>
  )
}

function Seccion({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{titulo}</CardTitle>
        {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</CardContent>
    </Card>
  )
}

function CampoTexto({
  label, reg, err, full,
}: { label: string; reg: ReturnType<UseFormRegister<ColaboradorInput>>; err?: string; full?: boolean }) {
  return (
    <div className={`space-y-1.5 ${full ? 'sm:col-span-2 lg:col-span-3' : ''}`}>
      <Label>{label}</Label>
      <Input {...reg} />
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  )
}

function CampoFecha({ label, reg, err }: { label: string; reg: ReturnType<UseFormRegister<ColaboradorInput>>; err?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type="date" {...reg} />
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  )
}

function CampoSelect({
  label, valor, opciones, onChange, err, opcional,
}: {
  label: string; valor: string; opciones: { valor: string; etiqueta: string }[]
  onChange: (v: string) => void; err?: string; opcional?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={valor || undefined} onValueChange={onChange}>
        <SelectTrigger className="w-full"><SelectValue placeholder={opcional ? '— Sin definir —' : 'Selecciona…'} /></SelectTrigger>
        <SelectContent>
          {opciones.map((o) => <SelectItem key={o.valor} value={o.valor}>{o.etiqueta}</SelectItem>)}
        </SelectContent>
      </Select>
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  )
}
