'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Save } from 'lucide-react'
import { miFichaSchema, type MiFichaInput } from '@/lib/validaciones/colaborador'
import { actualizarMiFicha } from '../acciones'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type Opcion = { id: string; nombre: string }
type Catalogos = {
  ciudades: Opcion[]; eps: Opcion[]; afp: Opcion[]; fondosCesantias: Opcion[]; cajas: Opcion[]; arl: Opcion[]; bancos: Opcion[]
}

const GENERO = { MASCULINO: 'Masculino', FEMENINO: 'Femenino', OTRO: 'Otro', PREFIERE_NO_DECIR: 'Prefiere no decir' }
const ESTADO_CIVIL = { SOLTERO: 'Soltero(a)', CASADO: 'Casado(a)', UNION_LIBRE: 'Unión libre', SEPARADO: 'Separado(a)', DIVORCIADO: 'Divorciado(a)', VIUDO: 'Viudo(a)' }
const RH = { A_POS: 'A+', A_NEG: 'A−', B_POS: 'B+', B_NEG: 'B−', AB_POS: 'AB+', AB_NEG: 'AB−', O_POS: 'O+', O_NEG: 'O−' }
const NIVEL = { PRIMARIA: 'Primaria', BACHILLER: 'Bachiller', TECNICO: 'Técnico', TECNOLOGO: 'Tecnólogo', PREGRADO: 'Pregrado', ESPECIALIZACION: 'Especialización', MAESTRIA: 'Maestría', DOCTORADO: 'Doctorado' }
const TIPO_CUENTA = { AHORROS: 'Ahorros', CORRIENTE: 'Corriente', BILLETERA_DIGITAL: 'Billetera digital' }

export function MiInformacionForm({ catalogos, valores }: { catalogos: Catalogos; valores: MiFichaInput }) {
  const router = useRouter()
  const [guardando, setGuardando] = useState(false)
  const { register, handleSubmit, setValue, watch } = useForm<MiFichaInput>({
    resolver: zodResolver(miFichaSchema),
    defaultValues: valores,
  })

  async function onSubmit(d: MiFichaInput) {
    setGuardando(true)
    const res = await actualizarMiFicha(d)
    setGuardando(false)
    if (res.ok) {
      toast.success('Tu información fue guardada. Talento Humano la revisará.')
      router.refresh()
    } else toast.error(res.error)
  }

  const Selector = ({ campo, opciones, placeholder }: { campo: keyof MiFichaInput; opciones: Record<string, string> | Opcion[]; placeholder?: string }) => {
    const items = Array.isArray(opciones) ? opciones.map((o) => [o.id, o.nombre] as const) : Object.entries(opciones)
    return (
      <Select value={(watch(campo) as string) || undefined} onValueChange={(v) => setValue(campo, v as never)}>
        <SelectTrigger className="w-full"><SelectValue placeholder={placeholder ?? 'Selecciona…'} /></SelectTrigger>
        <SelectContent>{items.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
      </Select>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Datos personales</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Campo label="Fecha de expedición del documento"><Input type="date" {...register('fechaExpedicionDoc')} /></Campo>
          <Campo label="Lugar de expedición"><Input {...register('lugarExpedicionDoc')} /></Campo>
          <Campo label="Fecha de nacimiento"><Input type="date" {...register('fechaNacimiento')} /></Campo>
          <Campo label="Lugar de nacimiento"><Input {...register('lugarNacimiento')} /></Campo>
          <Campo label="Género"><Selector campo="genero" opciones={GENERO} /></Campo>
          <Campo label="Estado civil"><Selector campo="estadoCivil" opciones={ESTADO_CIVIL} /></Campo>
          <Campo label="Grupo sanguíneo (RH)"><Selector campo="grupoSanguineo" opciones={RH} /></Campo>
          <Campo label="Nivel educativo máximo"><Selector campo="nivelEducativoMax" opciones={NIVEL} /></Campo>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Contacto</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Campo label="Dirección" full><Input {...register('direccion')} /></Campo>
          <Campo label="Barrio"><Input {...register('barrio')} /></Campo>
          <Campo label="Ciudad de residencia"><Selector campo="ciudadResidenciaId" opciones={catalogos.ciudades} /></Campo>
          <Campo label="Teléfono fijo"><Input {...register('telefono')} /></Campo>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Contacto de emergencia</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Campo label="Nombre"><Input {...register('emergenciaNombre')} /></Campo>
          <Campo label="Parentesco"><Input {...register('emergenciaParentesco')} /></Campo>
          <Campo label="Teléfono"><Input {...register('emergenciaTelefono')} /></Campo>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Seguridad social</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Campo label="EPS (salud)"><Selector campo="epsId" opciones={catalogos.eps} /></Campo>
          <Campo label="Fondo de pensiones (AFP)"><Selector campo="afpId" opciones={catalogos.afp} /></Campo>
          <Campo label="Fondo de cesantías"><Selector campo="fondoCesantiasId" opciones={catalogos.fondosCesantias} /></Campo>
          <Campo label="Caja de compensación"><Selector campo="cajaCompensacionId" opciones={catalogos.cajas} /></Campo>
          <Campo label="ARL"><Selector campo="arlId" opciones={catalogos.arl} /></Campo>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Datos bancarios (para el pago de nómina)</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Campo label="Banco"><Selector campo="bancoId" opciones={catalogos.bancos} /></Campo>
          <Campo label="Tipo de cuenta"><Selector campo="tipoCuenta" opciones={TIPO_CUENTA} /></Campo>
          <Campo label="Número de cuenta"><Input {...register('numeroCuenta')} /></Campo>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Tallas de dotación</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Campo label="Camisa"><Input {...register('tallaCamisa')} placeholder="M, L, 38…" /></Campo>
          <Campo label="Pantalón"><Input {...register('tallaPantalon')} placeholder="32, 34…" /></Campo>
          <Campo label="Calzado"><Input {...register('tallaCalzado')} placeholder="40, 41…" /></Campo>
        </CardContent>
      </Card>

      <div className="sticky bottom-4 flex justify-end rounded-lg border bg-card p-3 shadow-sm">
        <Button type="submit" disabled={guardando}>{guardando ? <Spinner /> : <Save className="size-4" />} Guardar mi información</Button>
      </div>
    </form>
  )
}

function Campo({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={`space-y-1.5 ${full ? 'sm:col-span-2' : ''}`}>
      <Label>{label}</Label>
      {children}
    </div>
  )
}
