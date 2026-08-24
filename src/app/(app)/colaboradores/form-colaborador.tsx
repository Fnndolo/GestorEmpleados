'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, type UseFormRegister } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { ChevronDown, Save } from 'lucide-react'
import { colaboradorSchema, type ColaboradorInput } from '@/lib/validaciones/colaborador'
import { crearColaborador, editarColaborador, sincronizarAccesoColaborador, type SugerenciaAcceso } from './acciones'
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
import { Ayuda } from '@/components/ui-kit/ayuda'

type Props = {
  catalogos: CatalogosColaborador
  valores?: Partial<ColaboradorInput> & { id?: string }
  puedeEditarSalud: boolean
}

const opcionesDe = (record: Record<string, string>) =>
  Object.entries(record).map(([valor, etiqueta]) => ({ valor, etiqueta }))

/**
 * Índice del formulario: qué campos vive cada bloque. Sirve para dos cosas que
 * el formulario largo no daba — saltar a una sección y ver cuánto le falta sin
 * recorrerla. Debe mantenerse en sincronía con las <Seccion> de abajo.
 *
 * El orden no es cosmético: primero lo que SÍ o SÍ debe teclear quien registra
 * (lo exigido por `colaboradorSchema`), luego lo que solo Talento Humano puede
 * definir, y de últimas —plegado— todo lo que el propio colaborador completa
 * desde su autoservicio (`miFichaSchema`).
 */
const SECCIONES = [
  {
    id: 'minimos', titulo: 'Datos mínimos',
    campos: ['tipoDocumento', 'numeroDocumento', 'nombres', 'apellidos', 'celular', 'emailPersonal',
      'tipoVinculo', 'modalidadTrabajo', 'sedeId', 'fechaIngreso'],
  },
  {
    id: 'asignacion', titulo: 'Asignación',
    campos: ['areaId', 'cargoId', 'jefeInmediatoId', 'estado'],
  },
  {
    id: 'personales', titulo: 'Datos personales', opcional: true,
    campos: ['fechaExpedicionDoc', 'lugarExpedicionDoc', 'fechaNacimiento', 'lugarNacimiento',
      'genero', 'estadoCivil', 'grupoSanguineo', 'nivelEducativoMax'],
  },
  { id: 'residencia', titulo: 'Residencia', opcional: true, campos: ['direccion', 'ciudadResidenciaId'] },
  {
    id: 'emergencia', titulo: 'Emergencia', opcional: true,
    campos: ['emergenciaNombre', 'emergenciaParentesco', 'emergenciaTelefono'],
  },
  {
    id: 'seguridad-social', titulo: 'Seguridad social', opcional: true, soloSalud: true,
    campos: ['epsId', 'afpId', 'fondoCesantiasId', 'cajaCompensacionId', 'arlId'],
  },
  { id: 'bancarios', titulo: 'Datos bancarios', opcional: true, campos: ['bancoId', 'tipoCuenta', 'numeroCuenta'] },
  { id: 'dotacion', titulo: 'Dotación', opcional: true, campos: ['tallaCamisa', 'tallaPantalon', 'tallaCalzado'] },
] as const satisfies readonly {
  id: string; titulo: string; soloSalud?: boolean; opcional?: boolean
  campos: readonly (keyof ColaboradorInput)[]
}[]

export function FormColaborador({ catalogos, valores, puedeEditarSalud }: Props) {
  const router = useRouter()
  const esEdicion = Boolean(valores?.id)
  const [guardando, setGuardando] = useState(false)
  const [sugerencia, setSugerencia] = useState<SugerenciaAcceso | null>(null)
  const [sincronizando, setSincronizando] = useState(false)
  const decididoRef = useRef(false)
  // Al registrar se parte de lo mínimo; al editar se abre todo, porque ahí el
  // trabajo suele ser justamente completar lo que faltaba.
  const [mostrarOpcionales, setMostrarOpcionales] = useState(esEdicion)

  const form = useForm<ColaboradorInput>({
    resolver: zodResolver(colaboradorSchema),
    defaultValues: {
      tipoDocumento: 'CC', numeroDocumento: '', fechaExpedicionDoc: '', lugarExpedicionDoc: '',
      nombres: '', apellidos: '', fechaNacimiento: '', lugarNacimiento: '', genero: '', estadoCivil: '',
      grupoSanguineo: '', direccion: '', ciudadResidenciaId: '', celular: '',
      emailPersonal: '', emergenciaNombre: '', emergenciaParentesco: '',
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

  /**
   * Cambiar el área puede invalidar el cargo elegido, porque cada cargo
   * pertenece a un área. Antes se borraba SIEMPRE y en silencio: quien elegía
   * primero el cargo y después el área guardaba la ficha sin cargo sin
   * enterarse. Ahora solo se borra si de verdad dejó de corresponder, y se dice.
   */
  function cambiarArea(nuevaAreaId: string) {
    setValue('areaId', nuevaAreaId)
    const cargoActual = watch('cargoId')
    if (!cargoActual) return
    const sigueValido = catalogos.cargos.some((c) => c.id === cargoActual && c.areaId === nuevaAreaId)
    if (sigueValido) return
    setValue('cargoId', '')
    const area = catalogos.areas.find((a) => a.id === nuevaAreaId)
    toast.warning(`Se quitó el cargo: no pertenece al área ${area?.nombre ?? 'seleccionada'}. Elige uno de esa área.`)
  }

  // Un área sin cargos deja el desplegable vacío y sin explicación: quien llena
  // la ficha cree que el campo no sirve, y el colaborador termina sin cargo.
  const notaCargo = areaSeleccionada && cargosFiltrados.length === 0
    ? `El área ${catalogos.areas.find((a) => a.id === areaSeleccionada)?.nombre ?? 'seleccionada'} todavía no tiene cargos. Créalos en Ajustes → Cargos y vuelve, o deja el área en blanco para ver todos.`
    : undefined

  // Índice lateral: secciones visibles según permiso, con lo que lleva cada una.
  const todos = watch()
  const seccionesVisibles = SECCIONES.filter((s) => !('soloSalud' in s && s.soloSalud) || puedeEditarSalud)
  const avance = seccionesVisibles.map((s) => ({
    ...s,
    esOpcional: 'opcional' in s && s.opcional === true,
    llenos: s.campos.filter((c) => String(todos[c] ?? '').trim() !== '').length,
    total: s.campos.length,
  }))
  const opcionales = avance.filter((s) => s.esOpcional)
  const llenosOpcionales = opcionales.reduce((n, s) => n + s.llenos, 0)
  const totalOpcionales = opcionales.reduce((n, s) => n + s.total, 0)

  // La sección visible manda en el índice: se resalta sola al desplazarse.
  const [seccionActiva, setSeccionActiva] = useState<string>(seccionesVisibles[0].id)
  useEffect(() => {
    const observador = new IntersectionObserver(
      (entradas) => {
        const visible = entradas.find((e) => e.isIntersecting)
        if (visible) setSeccionActiva(visible.target.id)
      },
      // El recorte de abajo evita que dos secciones se disputen el resaltado.
      { rootMargin: '-150px 0px -60% 0px' },
    )
    for (const s of seccionesVisibles) {
      const el = document.getElementById(s.id)
      if (el) observador.observe(el)
    }
    return () => observador.disconnect()
    // Al desplegar los opcionales aparecen secciones nuevas que hay que observar.
  }, [puedeEditarSalud, mostrarOpcionales])

  /**
   * Salto desde el índice. Si la sección está dentro del bloque plegado hay que
   * desplegarlo primero: el ancla no puede llevar a un nodo que aún no existe.
   */
  function irASeccion(e: React.MouseEvent, id: string, esOpcional: boolean) {
    if (!esOpcional || mostrarOpcionales) return
    e.preventDefault()
    setMostrarOpcionales(true)
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function irADetalle(id: string) {
    if (decididoRef.current) return
    decididoRef.current = true
    router.push(`/colaboradores/${id}`)
    router.refresh()
  }

  async function onSubmit(datos: ColaboradorInput) {
    setGuardando(true)
    const res = esEdicion
      ? await editarColaborador({ ...datos, id: valores!.id! })
      : await crearColaborador(datos)
    setGuardando(false)
    if (!res.ok) { toast.error(res.error); return }

    if (esEdicion) {
      toast.success('Colaborador actualizado.')
      const d = res.datos as { sugerencia?: SugerenciaAcceso | null }
      if (d.sugerencia) { setSugerencia(d.sugerencia); return } // esperar decisión del admin
      irADetalle(valores!.id!)
      return
    }

    const d = res.datos as { id: string; usuarioCreado?: boolean; sinCorreo?: boolean; correoYaTeniaUsuario?: boolean }
    if (d.usuarioCreado) toast.success('Colaborador creado. Se creó su usuario y se le envió la invitación por correo.')
    else if (d.correoYaTeniaUsuario) toast.warning('Colaborador creado, pero ese correo YA tiene un usuario en el sistema: no se creó cuenta nueva ni se envió invitación. Usa un correo distinto si es otra persona.', { duration: 9000 })
    else if (d.sinCorreo) toast.success('Colaborador creado. No tiene correo: no se creó usuario de acceso (puedes crearlo luego en Usuarios).')
    else toast.warning('Colaborador creado, pero no se pudo crear su usuario de acceso. Revisa el correo o créalo luego en Usuarios.')
    irADetalle(d.id)
  }

  async function aplicarSugerencia() {
    if (!sugerencia) return
    setSincronizando(true)
    const res = await sincronizarAccesoColaborador({
      colaboradorId: valores!.id!,
      tipo: sugerencia.tipo,
      rolId: sugerencia.tipo === 'rol' ? sugerencia.rolId : undefined,
    })
    setSincronizando(false)
    if (res.ok) {
      toast.success(sugerencia.tipo === 'rol'
        ? 'Rol de acceso actualizado.'
        : 'Se creó el usuario de acceso y se envió la invitación por correo.')
    } else {
      toast.error(res.error)
    }
    setSugerencia(null)
    irADetalle(valores!.id!)
  }

  function descartarSugerencia() {
    if (sincronizando) return
    setSugerencia(null)
    irADetalle(valores!.id!)
  }

  return (
    <>
    <form onSubmit={handleSubmit(onSubmit)} className="pb-4">
     <div className="grid items-start gap-6 xl:grid-cols-[190px_minmax(0,1fr)]">

      {/* Índice: salta a una sección y muestra cuánto le falta */}
      <nav className="sticky top-36 hidden xl:grid gap-0.5" aria-label="Secciones del formulario">
        {avance.map((s) => {
          const completa = s.llenos === s.total
          const activa = seccionActiva === s.id
          return (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={(e) => irASeccion(e, s.id, s.esOpcional)}
              aria-current={activa ? 'true' : undefined}
              className={`flex items-center justify-between gap-2 rounded-md border-l-2 px-3 py-2 text-sm transition-colors ${
                activa
                  ? 'border-l-primary bg-primary/10 font-medium text-primary'
                  : 'border-l-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {s.titulo}
              <span className={`text-xs tabular-nums ${completa ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                {s.llenos}/{s.total}
              </span>
            </a>
          )
        })}
      </nav>

      <div className="space-y-6">
      {/* ── Lo indispensable para registrar a la persona ─────────────────── */}
      <Seccion
        id="minimos"
        titulo="Datos mínimos"
        ayuda="Es lo único obligatorio para registrar al colaborador. Con esto queda creado y recibe por correo su invitación de acceso."
      >
        <CampoSelect label="Tipo de documento" obligatorio valor={watch('tipoDocumento')} opciones={opcionesDe(TIPO_DOCUMENTO_IDENTIDAD)} onChange={(v) => setValue('tipoDocumento', v as ColaboradorInput['tipoDocumento'])} />
        <CampoTexto label="Número de documento" obligatorio reg={register('numeroDocumento')} err={errors.numeroDocumento?.message} />
        <div className="hidden lg:block" aria-hidden />
        <CampoTexto label="Nombres" obligatorio reg={register('nombres')} err={errors.nombres?.message} />
        <CampoTexto label="Apellidos" obligatorio reg={register('apellidos')} err={errors.apellidos?.message} />
        <div className="hidden lg:block" aria-hidden />
        <CampoTexto label="Celular" obligatorio reg={register('celular')} err={errors.celular?.message} />
        <CampoTexto
          label="Correo personal"
          obligatorio
          ayuda="Ahí le llegan sus credenciales de acceso y las notificaciones."
          reg={register('emailPersonal')}
          err={errors.emailPersonal?.message}
        />
        <div className="hidden lg:block" aria-hidden />
        <CampoSelect label="Tipo de vínculo" obligatorio valor={watch('tipoVinculo')} opciones={opcionesDe(TIPO_VINCULO)} onChange={(v) => setValue('tipoVinculo', v as ColaboradorInput['tipoVinculo'])} />
        <CampoSelect label="Modalidad de trabajo" obligatorio valor={watch('modalidadTrabajo')} opciones={opcionesDe(MODALIDAD_TRABAJO)} onChange={(v) => setValue('modalidadTrabajo', v as ColaboradorInput['modalidadTrabajo'])} />
        <CampoSelect label="Sede" obligatorio valor={watch('sedeId')} opciones={catalogos.sedes.map((s) => ({ valor: s.id, etiqueta: `${s.nombre} · ${s.ciudad}` }))} onChange={(v) => setValue('sedeId', v)} err={errors.sedeId?.message} />
        <CampoFecha label="Fecha de ingreso" obligatorio reg={register('fechaIngreso')} err={errors.fechaIngreso?.message} />
      </Seccion>

      {/* ── Lo que solo define Talento Humano (no aparece en autoservicio) ── */}
      <Seccion
        id="asignacion"
        titulo="Asignación en la empresa"
        ayuda="Opcional, pero esto no lo puede llenar el colaborador desde su autoservicio: si lo dejas en blanco, queda pendiente para Talento Humano."
      >
        <CampoSelect label="Área" valor={watch('areaId') ?? ''} opciones={catalogos.areas.map((a) => ({ valor: a.id, etiqueta: a.nombre }))} onChange={cambiarArea} opcional />
        <CampoSelect label="Cargo" valor={watch('cargoId') ?? ''} opciones={cargosFiltrados.map((c) => ({ valor: c.id, etiqueta: c.nombre }))} onChange={(v) => setValue('cargoId', v)} opcional nota={notaCargo} />
        <CampoSelect label="Jefe inmediato" valor={watch('jefeInmediatoId') ?? ''} opciones={catalogos.jefes.filter((j) => j.id !== valores?.id).map((j) => ({ valor: j.id, etiqueta: j.nombre }))} onChange={(v) => setValue('jefeInmediatoId', v)} opcional />
        <CampoSelect label="Estado" valor={watch('estado')} opciones={opcionesDe(ESTADO_COLABORADOR)} onChange={(v) => setValue('estado', v as ColaboradorInput['estado'])} />
        {puedeEditarSalud && (
          <CampoSelect label="Clase de riesgo ARL" valor={watch('claseRiesgoArl') ?? ''} opciones={opcionesDe(CLASE_RIESGO_ARL)} onChange={(v) => setValue('claseRiesgoArl', v as ColaboradorInput['claseRiesgoArl'])} opcional />
        )}
      </Seccion>

      {/* ── Todo lo demás: plegado, porque lo completa el propio colaborador ── */}
      <button
        type="button"
        onClick={() => setMostrarOpcionales((v) => !v)}
        aria-expanded={mostrarOpcionales}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-dashed p-4 text-left transition-colors hover:bg-muted/50"
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium">Resto de la ficha</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Opcional · lo completa el colaborador desde su autoservicio
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">{llenosOpcionales}/{totalOpcionales}</span>
          <ChevronDown className={`size-4 transition-transform ${mostrarOpcionales ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {mostrarOpcionales && (
        <div className="space-y-6">
          <Seccion id="personales" titulo="Datos personales">
            <CampoFecha label="Fecha de expedición" reg={register('fechaExpedicionDoc')} />
            <CampoTexto label="Lugar de expedición" reg={register('lugarExpedicionDoc')} />
            <CampoFecha label="Fecha de nacimiento" reg={register('fechaNacimiento')} />
            <CampoTexto label="Lugar de nacimiento" reg={register('lugarNacimiento')} />
            <CampoSelect label="Género" valor={watch('genero') ?? ''} opciones={opcionesDe(GENERO)} onChange={(v) => setValue('genero', v as ColaboradorInput['genero'])} opcional />
            <CampoSelect label="Estado civil" valor={watch('estadoCivil') ?? ''} opciones={opcionesDe(ESTADO_CIVIL)} onChange={(v) => setValue('estadoCivil', v as ColaboradorInput['estadoCivil'])} opcional />
            <CampoSelect label="Grupo sanguíneo (RH)" valor={watch('grupoSanguineo') ?? ''} opciones={opcionesDe(GRUPO_SANGUINEO)} onChange={(v) => setValue('grupoSanguineo', v as ColaboradorInput['grupoSanguineo'])} opcional />
            <CampoSelect label="Nivel educativo máximo" valor={watch('nivelEducativoMax') ?? ''} opciones={opcionesDe(NIVEL_EDUCATIVO)} onChange={(v) => setValue('nivelEducativoMax', v as ColaboradorInput['nivelEducativoMax'])} opcional />
          </Seccion>

          <Seccion id="residencia" titulo="Residencia">
            <CampoTexto label="Dirección" reg={register('direccion')} full />
            <CampoSelect label="Ciudad de residencia" valor={watch('ciudadResidenciaId') ?? ''} opciones={catalogos.ciudades.map((c) => ({ valor: c.id, etiqueta: `${c.nombre} · ${c.departamento}` }))} onChange={(v) => setValue('ciudadResidenciaId', v)} opcional />
          </Seccion>

          <Seccion id="emergencia" titulo="Contacto de emergencia">
            <CampoTexto label="Nombre" reg={register('emergenciaNombre')} />
            <CampoTexto label="Parentesco" reg={register('emergenciaParentesco')} />
            <CampoTexto label="Teléfono" reg={register('emergenciaTelefono')} />
          </Seccion>

          {puedeEditarSalud && (
            <Seccion id="seguridad-social" titulo="Seguridad social" ayuda="Información sensible (Ley 1581). Solo visible para perfiles autorizados.">
              <CampoSelect label="EPS" valor={watch('epsId') ?? ''} opciones={catalogos.eps.map((e) => ({ valor: e.id, etiqueta: e.nombre }))} onChange={(v) => setValue('epsId', v)} opcional />
              <CampoSelect label="Fondo de pensión (AFP)" valor={watch('afpId') ?? ''} opciones={catalogos.afp.map((e) => ({ valor: e.id, etiqueta: e.nombre }))} onChange={(v) => setValue('afpId', v)} opcional />
              <CampoSelect label="Fondo de cesantías" valor={watch('fondoCesantiasId') ?? ''} opciones={catalogos.fondosCesantias.map((e) => ({ valor: e.id, etiqueta: e.nombre }))} onChange={(v) => setValue('fondoCesantiasId', v)} opcional />
              <CampoSelect label="Caja de compensación" valor={watch('cajaCompensacionId') ?? ''} opciones={catalogos.cajas.map((e) => ({ valor: e.id, etiqueta: e.nombre }))} onChange={(v) => setValue('cajaCompensacionId', v)} opcional />
              <CampoSelect label="ARL" valor={watch('arlId') ?? ''} opciones={catalogos.arl.map((e) => ({ valor: e.id, etiqueta: e.nombre }))} onChange={(v) => setValue('arlId', v)} opcional />
            </Seccion>
          )}

          <Seccion id="bancarios" titulo="Datos bancarios">
            <CampoSelect label="Banco" valor={watch('bancoId') ?? ''} opciones={catalogos.bancos.map((b) => ({ valor: b.id, etiqueta: b.nombre }))} onChange={(v) => setValue('bancoId', v)} opcional />
            <CampoSelect label="Tipo de cuenta" valor={watch('tipoCuenta') ?? ''} opciones={opcionesDe(TIPO_CUENTA)} onChange={(v) => setValue('tipoCuenta', v as ColaboradorInput['tipoCuenta'])} opcional />
            <CampoTexto label="Número de cuenta" reg={register('numeroCuenta')} />
          </Seccion>

          <Seccion id="dotacion" titulo="Tallas para dotación">
            <CampoTexto label="Camisa" reg={register('tallaCamisa')} />
            <CampoTexto label="Pantalón" reg={register('tallaPantalon')} />
            <CampoTexto label="Calzado" reg={register('tallaCalzado')} />
          </Seccion>
        </div>
      )}

      <div className="sticky bottom-16 lg:bottom-0 -mx-4 lg:mx-0 flex justify-end gap-2 border-t bg-background/95 p-3 backdrop-blur">
        <Button type="button" variant="ghost" onClick={() => router.back()}>Cancelar</Button>
        <Button type="submit" disabled={guardando}>
          {guardando ? <Spinner /> : <Save className="size-4" />} Guardar colaborador
        </Button>
      </div>
      </div>
     </div>
    </form>

    <AlertDialog open={!!sugerencia} onOpenChange={(abierto) => { if (!abierto) descartarSugerencia() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {sugerencia?.tipo === 'rol' ? 'Actualizar el rol de acceso' : 'Crear usuario de acceso'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {sugerencia?.tipo === 'rol'
              ? `El cargo cambió. ¿Actualizar el rol de acceso de "${sugerencia.rolActual ?? '—'}" a "${sugerencia.rolNombre}"? Esto cambia los permisos del usuario en el sistema.`
              : sugerencia?.tipo === 'crearCuenta'
                ? `Este colaborador está activo y tiene correo (${sugerencia.email}) pero aún no tiene usuario de acceso. ¿Crearlo y enviarle la invitación por correo?`
                : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" disabled={sincronizando} onClick={descartarSugerencia}>Ahora no</Button>
          <Button disabled={sincronizando} onClick={aplicarSugerencia}>
            {sincronizando ? <Spinner /> : null}
            {sugerencia?.tipo === 'rol' ? 'Actualizar rol' : 'Crear acceso'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}

function Seccion({ id, titulo, ayuda, children }: { id: string; titulo: string; ayuda?: string; children: React.ReactNode }) {
  return (
    // scroll-mt deja la sección bajo la cabecera fija al llegar desde el índice.
    <Card id={id} className="scroll-mt-36">
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-base">
          {titulo}
          {ayuda && <Ayuda texto={ayuda} etiqueta={`Sobre ${titulo}`} />}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</CardContent>
    </Card>
  )
}

/** Marca de campo exigido por el esquema. No es decorativa: si falta, no guarda. */
function Etiqueta({ label, obligatorio, ayuda }: { label: string; obligatorio?: boolean; ayuda?: string }) {
  return (
    <Label className="flex items-center gap-1.5">
      <span>
        {label}
        {obligatorio && <span className="ml-0.5 text-destructive" aria-label="obligatorio">*</span>}
      </span>
      {ayuda && <Ayuda texto={ayuda} etiqueta={`Sobre ${label}`} />}
    </Label>
  )
}

function CampoTexto({
  label, reg, err, full, obligatorio, ayuda,
}: {
  label: string; reg: ReturnType<UseFormRegister<ColaboradorInput>>; err?: string
  full?: boolean; obligatorio?: boolean; ayuda?: string
}) {
  return (
    <div className={`space-y-1.5 ${full ? 'sm:col-span-2 lg:col-span-3' : ''}`}>
      <Etiqueta label={label} obligatorio={obligatorio} ayuda={ayuda} />
      <Input {...reg} />
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  )
}

function CampoFecha({
  label, reg, err, obligatorio,
}: { label: string; reg: ReturnType<UseFormRegister<ColaboradorInput>>; err?: string; obligatorio?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Etiqueta label={label} obligatorio={obligatorio} />
      <Input type="date" {...reg} />
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  )
}

function CampoSelect({
  label, valor, opciones, onChange, err, opcional, obligatorio, nota,
}: {
  label: string; valor: string; opciones: { valor: string; etiqueta: string }[]
  onChange: (v: string) => void; err?: string; opcional?: boolean; obligatorio?: boolean
  /** Aclaración bajo el campo: por qué está vacío, qué hacer. */
  nota?: string
}) {
  return (
    <div className="space-y-1.5">
      <Etiqueta label={label} obligatorio={obligatorio} />
      <Select value={valor || undefined} onValueChange={onChange}>
        <SelectTrigger className="w-full"><SelectValue placeholder={opcional ? '— Sin definir —' : 'Selecciona…'} /></SelectTrigger>
        <SelectContent>
          {opciones.map((o) => <SelectItem key={o.valor} value={o.valor}>{o.etiqueta}</SelectItem>)}
        </SelectContent>
      </Select>
      {err && <p className="text-xs text-destructive">{err}</p>}
      {!err && nota && <p className="text-xs text-muted-foreground">{nota}</p>}
    </div>
  )
}
