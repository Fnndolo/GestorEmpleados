import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { whereColaboradores } from '@/server/consultas/colaboradores'
import { Encabezado } from '@/components/shell/encabezado'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { TabsContent } from '@/components/ui/tabs'
import { TabsResponsive } from '@/components/shell/tabs-responsive'
import {
  Pencil, Phone, ShieldAlert, CalendarDays, FileText, Download, Receipt,
  IdCard, HeartPulse, BriefcaseBusiness, Landmark, Shirt, TreePalm, Banknote, CalendarClock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Stat, BloqueDatos } from '@/components/ui-kit'
import { fmtCOP } from '@/lib/moneda'
import { saldoVacaciones } from '@/server/vacaciones'
import { GestorDocumentos } from '@/components/documentos/gestor-documentos'
import { FotoUploader } from './foto-uploader'
import { EducacionLista } from './educacion-lista'
import { BotonCertificacion } from './boton-certificacion'
import { BotonDisciplinario } from './boton-disciplinario'
import { formatFechaLarga, formatFechaISO, formatFechaCorta, calcularEdad, antiguedad, hoyBogota } from '@/lib/fechas'

const TIPO_CAPACITACION: Record<string, string> = { INDUCCION: 'Inducción', REINDUCCION: 'Reinducción', FORMACION: 'Formación', SST: 'SST' }
import {
  TIPO_VINCULO, MODALIDAD_TRABAJO, ESTADO_COLABORADOR, TIPO_DOCUMENTO_IDENTIDAD,
  GENERO, ESTADO_CIVIL, GRUPO_SANGUINEO, NIVEL_EDUCATIVO, TIPO_CUENTA, CLASE_RIESGO_ARL,
  iniciales,
} from '@/lib/etiquetas'

export const metadata = { title: 'Ficha del colaborador · Smart Gadgets RH' }

export default async function FichaColaboradorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const usuario = await requerirPermiso('colaboradores', 'VER')
  const puedeEditar = tienePermiso(usuario, 'colaboradores', 'EDITAR')
  const verSalud = tienePermiso(usuario, 'colaboradores_salud', 'VER')
  const puedeDisciplinar = tienePermiso(usuario, 'juridica', 'CREAR')
  // El botón "Ver contrato" lleva a la ruta administrativa; sin este permiso
  // (p. ej. un empleado viendo su propia ficha) daría "sin permiso": se
  // reemplaza por el enlace de autoservicio (OPS) o se oculta (laboral).
  const puedeVerContratos = tienePermiso(usuario, 'contratos', 'VER')

  // Seguridad: intersecta el id con el ALCANCE del usuario (PROPIO/EQUIPO/SEDES/
  // TODAS). Sin esto, un empleado podía abrir la ficha de cualquiera por la URL
  // (datos personales/bancarios). `findFirst` + where de alcance → notFound si no
  // le corresponde. Se ignora la cookie de sede: la seguridad la da el alcance.
  const c = await prisma.colaborador.findFirst({
    where: await whereColaboradores(usuario, { id }, { ignorarSedeActiva: true }),
    include: {
      sede: { include: { ciudad: true } },
      area: true,
      cargo: true,
      jefeInmediato: true,
      ciudadResidencia: true,
      eps: true, afp: true, fondoCesantias: true, cajaCompensacion: true, arl: true,
      banco: true,
      educacion: { orderBy: { fechaGrado: 'desc' } },
    },
  })
  if (!c) notFound()

  const [documentos, requeridos, tiposDocumento] = await Promise.all([
    prisma.documento.findMany({
      where: { entidadTipo: 'Colaborador', entidadId: id },
      include: { tipoDocumento: true },
      orderBy: { creadoEn: 'desc' },
    }),
    prisma.documentoRequerido.findMany({
      where: { tipoVinculo: c.tipoVinculo },
      include: { tipoDocumento: true },
    }),
    prisma.tipoDocumento.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }),
  ])

  // Los desprendibles los ve quien tiene permiso de nómina o el propio colaborador (su ficha)
  const esPropia = usuario.colaboradorId === id
  const mostrarPagos = tienePermiso(usuario, 'nomina', 'VER') || esPropia
  const [contratos, contratosOps, eduDocs, liquidaciones, variacionesSalariales] = await Promise.all([
    prisma.contrato.findMany({ where: { colaboradorId: id }, include: { cargo: true, sede: true }, orderBy: { fechaInicio: 'desc' } }),
    prisma.contratoOps.findMany({ where: { colaboradorId: id }, include: { sede: true }, orderBy: { fechaInicio: 'desc' } }),
    prisma.documento.findMany({ where: { entidadTipo: 'EducacionColaborador', entidadId: { in: c.educacion.map((e) => e.id) } }, select: { id: true, entidadId: true } }),
    mostrarPagos
      ? prisma.liquidacionNomina.findMany({ where: { colaboradorId: id, documentoId: { not: null } }, include: { periodo: { select: { nombre: true } } }, orderBy: { creadoEn: 'desc' }, take: 60 })
      : Promise.resolve([]),
    // Historial de variaciones salariales (requerimiento 3.4); cada otrosí de salario crea una.
    prisma.variacionSalarial.findMany({ where: { colaboradorId: id }, orderBy: { fechaVigencia: 'desc' } }),
  ])

  // Capacitaciones internas del colaborador (RIT art. 95) para la pestaña Educación.
  const capacitacionesColab = await prisma.asistenciaCapacitacion.findMany({
    where: { colaboradorId: id },
    include: { capacitacion: true },
    orderBy: { capacitacion: { fecha: 'desc' } },
  })

  const certDocPorEdu = new Map<string, string>()
  for (const d of eduDocs) if (!certDocPorEdu.has(d.entidadId)) certDocPorEdu.set(d.entidadId, d.id)

  // Contrato "principal" para adjuntar su documento (laboral más reciente, o el OPS más reciente)
  const principal = contratos[0]
    ? { tipo: 'Contrato' as const, id: contratos[0].id, sedeId: contratos[0].sedeId }
    : contratosOps[0]
      ? { tipo: 'ContratoOps' as const, id: contratosOps[0].id, sedeId: contratosOps[0].sedeId }
      : null
  const contratoDocs = principal
    ? await prisma.documento.findMany({ where: { entidadTipo: principal.tipo, entidadId: principal.id }, include: { tipoDocumento: true }, orderBy: { creadoEn: 'desc' } })
    : []

  // Documentos visibles según nivel de acceso del usuario
  const documentosVisibles = documentos.filter(
    (d) => d.nivelAcceso === 'GENERAL' || verSalud || d.nivelAcceso === 'RRHH' && puedeEditar,
  )

  // Semáforo documental
  const hoy = hoyBogota()
  const en30 = new Date(hoy)
  en30.setUTCDate(en30.getUTCDate() + 30)
  const porTipo = new Map<string, typeof documentos[number]>()
  for (const d of documentos) if (d.tipoDocumentoId) porTipo.set(d.tipoDocumentoId, d)
  const semaforo = requeridos.map((r) => {
    const doc = porTipo.get(r.tipoDocumentoId)
    let estado: 'al_dia' | 'falta' | 'vencido' | 'por_vencer' = 'falta'
    if (doc) {
      if (doc.fechaVencimiento && doc.fechaVencimiento < hoy) estado = 'vencido'
      else if (doc.fechaVencimiento && doc.fechaVencimiento <= en30) estado = 'por_vencer'
      else estado = 'al_dia'
    }
    return { nombre: r.tipoDocumento.nombre, obligatorio: r.obligatorio, estado }
  })

  const edad = calcularEdad(c.fechaNacimiento)

  // Datos clave del héroe: antigüedad, salario vigente, semáforo y vacaciones.
  const saldoVac = await saldoVacaciones(id)
  const contratoActivo = contratos.find((ct) => ct.estado === 'ACTIVO') ?? contratos[0] ?? null
  const opsActivo = contratosOps.find((ct) => ct.estado === 'ACTIVO') ?? contratosOps[0] ?? null
  const salarioActual = contratoActivo
    ? fmtCOP(Number(contratoActivo.salarioBase))
    : opsActivo?.valorMensual
      ? `${fmtCOP(Number(opsActivo.valorMensual))}/mes`
      : null
  const docsAlDia = semaforo.filter((s) => s.estado === 'al_dia').length
  const docsPorVencer = semaforo.filter((s) => s.estado === 'por_vencer').length
  const docsFaltan = semaforo.filter((s) => s.obligatorio && s.estado === 'falta').length

  return (
    <div className="mx-auto max-w-4xl">
      <Encabezado
        titulo="Ficha del colaborador"
        acciones={
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={`/colaboradores/${id}/calendario`}><CalendarDays className="size-4" /> Calendario</Link>
            </Button>
            {puedeDisciplinar && <BotonDisciplinario colaboradorId={id} nombre={`${c.nombres} ${c.apellidos}`} />}
            {puedeEditar && (
              <>
                <BotonCertificacion colaboradorId={id} />
                <Button asChild size="sm">
                  <Link href={`/colaboradores/${id}/editar`}><Pencil className="size-4" /> Editar</Link>
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Héroe */}
      <Card className="mb-4 overflow-hidden">
        <CardContent className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent py-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <FotoUploader
              colaboradorId={c.id}
              iniciales={iniciales(c.nombres, c.apellidos)}
              nombreCompleto={`${c.nombres} ${c.apellidos}`}
              tieneFoto={Boolean(c.fotoPath)}
              puedeEditar={puedeEditar}
            />
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-bold tracking-tight">{c.nombres} {c.apellidos}</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {c.cargo?.nombre ?? 'Sin cargo'}{c.area && ` · ${c.area.nombre}`}
                {c.jefeInmediato && ` · reporta a ${c.jefeInmediato.nombres} ${c.jefeInmediato.apellidos}`}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <span className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold',
                  c.estado === 'ACTIVO'
                    ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400'
                    : 'bg-foreground/8 text-muted-foreground',
                )}>
                  <span className={cn('size-1.5 rounded-full', c.estado === 'ACTIVO' ? 'bg-emerald-500' : 'bg-muted-foreground')} />
                  {ESTADO_COLABORADOR[c.estado]}
                </span>
                <Badge variant="outline">{TIPO_VINCULO[c.tipoVinculo]}</Badge>
                <Badge variant="outline">{MODALIDAD_TRABAJO[c.modalidadTrabajo]}</Badge>
                <Badge variant="outline">{c.sede.nombre} · {c.sede.ciudad.nombre}</Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Datos clave de un vistazo */}
      <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Stat icono={CalendarClock} color="bg-indigo-500/12 text-indigo-600 dark:text-indigo-400"
          valor={antiguedad(c.fechaIngreso)} label={`Antigüedad · desde ${formatFechaLarga(c.fechaIngreso)}`} />
        {salarioActual && (
          <Stat icono={Banknote} color="bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
            valor={salarioActual} label={contratoActivo ? 'Salario base actual' : 'Honorarios OPS'} />
        )}
        <Stat
          icono={FileText}
          color={docsFaltan > 0 ? 'bg-rose-500/12 text-rose-600 dark:text-rose-400' : 'bg-amber-500/12 text-amber-600 dark:text-amber-400'}
          valor={`${docsAlDia} de ${semaforo.length}`}
          label={`Documentos al día${docsPorVencer > 0 ? ` · ${docsPorVencer} por vencer` : ''}${docsFaltan > 0 ? ` · ${docsFaltan} falta${docsFaltan > 1 ? 'n' : ''}` : ''}`}
        />
        <Stat icono={TreePalm} color="bg-teal-500/12 text-teal-600 dark:text-teal-400"
          valor={`${saldoVac.saldo} días`} label="Vacaciones disponibles" />
      </div>

      <TabsResponsive
        items={[
          { valor: 'resumen', label: 'Resumen' },
          { valor: 'contrato', label: 'Contrato' },
          { valor: 'documentos', label: 'Documentos', alerta: semaforo.some((s) => s.obligatorio && s.estado === 'falta') },
          { valor: 'educacion', label: 'Educación' },
          ...(mostrarPagos ? [{ valor: 'pagos', label: 'Pagos' }] : []),
        ]}
      >

        {/* Resumen */}
        <TabsContent value="resumen" className="grid gap-3 sm:grid-cols-2">
          <BloqueDatos titulo="Identificación" icono={IdCard} color="bg-sky-500/12 text-sky-600 dark:text-sky-400" datos={[
            ['Documento', `${TIPO_DOCUMENTO_IDENTIDAD[c.tipoDocumento]} ${c.numeroDocumento}`],
            ['Fecha de nacimiento', c.fechaNacimiento ? `${formatFechaLarga(c.fechaNacimiento)}${edad !== null ? ` (${edad} años)` : ''}` : '—'],
            ['Género', c.genero ? GENERO[c.genero] : '—'],
            ['Estado civil', c.estadoCivil ? ESTADO_CIVIL[c.estadoCivil] : '—'],
            ['Grupo sanguíneo', c.grupoSanguineo ? GRUPO_SANGUINEO[c.grupoSanguineo] : '—'],
            ['Nivel educativo', c.nivelEducativoMax ? NIVEL_EDUCATIVO[c.nivelEducativoMax] : '—'],
          ]} />

          <BloqueDatos titulo="Contacto" icono={Phone} color="bg-teal-500/12 text-teal-600 dark:text-teal-400" datos={[
            ['Celular', c.celular],
            ['Teléfono', c.telefono ?? '—'],
            ['Correo personal', c.emailPersonal ?? '—'],
            ['Correo corporativo', c.emailCorporativo ?? '—'],
            ['Dirección', [c.direccion, c.barrio, c.ciudadResidencia?.nombre].filter(Boolean).join(', ') || '—'],
          ]} />

          <BloqueDatos titulo="Contacto de emergencia" icono={HeartPulse} color="bg-rose-500/12 text-rose-600 dark:text-rose-400" datos={[
            ['Nombre', c.emergenciaNombre ?? '—'],
            ['Parentesco', c.emergenciaParentesco ?? '—'],
            ['Teléfono', c.emergenciaTelefono ?? '—'],
          ]} />

          <BloqueDatos titulo="Información laboral" icono={BriefcaseBusiness} color="bg-indigo-500/12 text-indigo-600 dark:text-indigo-400" datos={[
            ['Vínculo', TIPO_VINCULO[c.tipoVinculo]],
            ['Modalidad', MODALIDAD_TRABAJO[c.modalidadTrabajo]],
            ['Sede', `${c.sede.nombre} · ${c.sede.ciudad.nombre}`],
            ['Área', c.area?.nombre ?? '—'],
            ['Cargo', c.cargo?.nombre ?? '—'],
            ['Jefe inmediato', c.jefeInmediato ? `${c.jefeInmediato.nombres} ${c.jefeInmediato.apellidos}` : '—'],
            ['Fecha de ingreso', `${formatFechaLarga(c.fechaIngreso)} (${antiguedad(c.fechaIngreso)})`],
          ]} />

          {verSalud ? (
            <BloqueDatos titulo="Seguridad social" icono={ShieldAlert} color="bg-amber-500/12 text-amber-600 dark:text-amber-400" nota="Sensible · Ley 1581" datos={[
              ['EPS', c.eps?.nombre ?? '—'],
              ['Fondo de pensión', c.afp?.nombre ?? '—'],
              ['Fondo de cesantías', c.fondoCesantias?.nombre ?? '—'],
              ['Caja de compensación', c.cajaCompensacion?.nombre ?? '—'],
              ['ARL', c.arl?.nombre ?? '—'],
              ['Clase de riesgo', c.claseRiesgoArl ? CLASE_RIESGO_ARL[c.claseRiesgoArl] : '—'],
            ]} />
          ) : (
            <Card><CardContent className="py-4 text-sm text-muted-foreground flex items-center gap-2">
              <ShieldAlert className="size-4" /> Los datos de seguridad social son sensibles y no están disponibles para tu perfil.
            </CardContent></Card>
          )}

          {(puedeEditar || verSalud) && (
            <BloqueDatos titulo="Datos bancarios" icono={Landmark} color="bg-foreground/8 text-foreground" datos={[
              ['Banco', c.banco?.nombre ?? '—'],
              ['Tipo de cuenta', c.tipoCuenta ? TIPO_CUENTA[c.tipoCuenta] : '—'],
              // Enmascarada: el número completo se consulta en edición si hace falta.
              ['Número de cuenta', c.numeroCuenta ? `•••• ${c.numeroCuenta.slice(-4)}` : '—'],
            ]} />
          )}

          <BloqueDatos titulo="Tallas para dotación" icono={Shirt} color="bg-violet-500/12 text-violet-600 dark:text-violet-400" datos={[
            ['Camisa', c.tallaCamisa ?? '—'],
            ['Pantalón', c.tallaPantalon ?? '—'],
            ['Calzado', c.tallaCalzado ?? '—'],
          ]} />

          {/* Semáforo documental: lo que exige acción se ve sin entrar a la pestaña Documentos */}
          {semaforo.length > 0 && (
            <Card className="sm:col-span-2">
              <CardContent className="py-4">
                <div className="mb-3 flex items-center gap-2.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-amber-500/12 text-amber-600 dark:text-amber-400">
                    <FileText className="size-4" />
                  </span>
                  <h3 className="text-sm font-bold">Semáforo documental</h3>
                  <span className="ml-auto text-[11px] font-medium text-muted-foreground">
                    {docsAlDia} al día{docsPorVencer > 0 ? ` · ${docsPorVencer} por vencer` : ''}{docsFaltan > 0 ? ` · ${docsFaltan} falta${docsFaltan > 1 ? 'n' : ''}` : ''}
                  </span>
                </div>
                <div className="divide-y divide-dashed">
                  {semaforo.map((s) => (
                    <div key={s.nombre} className="flex items-center gap-2.5 py-2 text-[13px]">
                      <span className={cn(
                        'size-2 shrink-0 rounded-full',
                        s.estado === 'al_dia' ? 'bg-emerald-500' : s.estado === 'por_vencer' ? 'bg-amber-500' : 'bg-rose-500',
                      )} />
                      <span className="min-w-0 flex-1 truncate">{s.nombre}</span>
                      <span className={cn(
                        'text-[11px] font-bold',
                        s.estado === 'al_dia' ? 'text-emerald-600 dark:text-emerald-400'
                          : s.estado === 'por_vencer' ? 'text-amber-600 dark:text-amber-400'
                          : 'text-rose-600 dark:text-rose-400',
                      )}>
                        {s.estado === 'al_dia' ? 'Al día' : s.estado === 'por_vencer' ? 'Por vencer' : s.estado === 'vencido' ? 'Vencido' : s.obligatorio ? 'Falta (obligatorio)' : 'Falta'}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Contrato vigente, sin salir del resumen */}
          {(contratoActivo || opsActivo) && (
            <Card className="sm:col-span-2">
              <CardContent className="py-4">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-teal-500/12 text-teal-600 dark:text-teal-400">
                    <FileText className="size-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
                      {contratoActivo ? contratoActivo.numero : opsActivo!.numero}
                      <Badge variant="outline">{contratoActivo ? TIPO_VINCULO[contratoActivo.tipo as keyof typeof TIPO_VINCULO] ?? contratoActivo.tipo : 'OPS'}</Badge>
                      <Badge variant={(contratoActivo?.estado ?? opsActivo!.estado) === 'ACTIVO' ? 'default' : 'secondary'}>
                        {contratoActivo?.estado ?? opsActivo!.estado}
                      </Badge>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {contratoActivo
                        ? `${fmtCOP(Number(contratoActivo.salarioBase))}${contratoActivo.tieneAuxTransporte ? ' · con aux. transporte' : ''} · desde ${formatFechaLarga(contratoActivo.fechaInicio)}`
                        : `${opsActivo!.valorMensual ? `${fmtCOP(Number(opsActivo!.valorMensual))}/mes · ` : ''}desde ${formatFechaLarga(opsActivo!.fechaInicio)} hasta ${formatFechaLarga(opsActivo!.fechaFin)}`}
                    </p>
                  </div>
                  {puedeVerContratos ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={contratoActivo ? `/contratos/${contratoActivo.id}` : `/contratos/ops/${opsActivo!.id}`}>Ver contrato</Link>
                    </Button>
                  ) : !contratoActivo && opsActivo ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href="/autoservicio/contratos">Ver mi contrato</Link>
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Contrato */}
        <TabsContent value="contrato" className="space-y-4">
          {contratos.length === 0 && contratosOps.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
              Este colaborador no tiene contratos registrados.
              {puedeEditar && <> <Link href="/contratos/nuevo" className="text-primary hover:underline">Crear contrato</Link>.</>}
            </CardContent></Card>
          ) : (
            <>
              {contratos.map((ct) => (
                <Card key={ct.id}><CardContent className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">{ct.numero}</p>
                        <Badge variant="outline">{TIPO_VINCULO[ct.tipo as keyof typeof TIPO_VINCULO] ?? ct.tipo}</Badge>
                        <Badge variant={ct.estado === 'ACTIVO' ? 'default' : 'secondary'}>{ct.estado}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {fmtCOP(Number(ct.salarioBase))}{ct.ganaSalarioMinimo ? ' · salario mínimo' : ''}
                        {ct.tieneAuxTransporte ? ' · con aux. transporte' : ''}
                        {ct.auxConectividad ? ` · conectividad ${fmtCOP(Number(ct.auxConectividad))}` : ''}
                      </p>
                      <p className="text-xs text-muted-foreground">{ct.cargo?.nombre ?? 'Sin cargo'} · {ct.sede.nombre} · desde {formatFechaLarga(ct.fechaInicio)}{ct.fechaFin ? ` hasta ${formatFechaLarga(ct.fechaFin)}` : ''}</p>
                    </div>
                    {puedeVerContratos && <Button asChild size="sm" variant="outline"><Link href={`/contratos/${ct.id}`}>Ver contrato</Link></Button>}
                  </div>
                </CardContent></Card>
              ))}
              {contratosOps.map((ct) => (
                <Card key={ct.id}><CardContent className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">{ct.numero}</p>
                        <Badge variant="outline">OPS</Badge>
                        <Badge variant={ct.estado === 'ACTIVO' ? 'default' : 'secondary'}>{ct.estado}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{ct.valorMensual ? `${fmtCOP(Number(ct.valorMensual))}/mes · ` : ''}{ct.sede.nombre} · desde {formatFechaLarga(ct.fechaInicio)} hasta {formatFechaLarga(ct.fechaFin)}</p>
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <Link href={puedeVerContratos ? `/contratos/ops/${ct.id}` : '/autoservicio/contratos'}>
                        {puedeVerContratos ? 'Ver contrato' : 'Ver mi contrato'}
                      </Link>
                    </Button>
                  </div>
                </CardContent></Card>
              ))}

              {/* Historial salarial (requerimiento 3.4): línea de tiempo de cada cambio. */}
              {variacionesSalariales.length > 0 && (
                <Card><CardContent className="py-4">
                  <h3 className="mb-3 text-sm font-medium">Historial salarial</h3>
                  <ul className="space-y-2">
                    {variacionesSalariales.map((v) => {
                      const sube = Number(v.salarioNuevo) >= Number(v.salarioAnterior)
                      return (
                        <li key={v.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                          <span className="text-xs text-muted-foreground tabular-nums">{formatFechaLarga(v.fechaVigencia)}</span>
                          <span className="tabular-nums">{fmtCOP(Number(v.salarioAnterior))}</span>
                          <span className={sube ? 'font-bold text-emerald-600 dark:text-emerald-400' : 'font-bold text-rose-600 dark:text-rose-400'}>→</span>
                          <span className="font-medium tabular-nums">{fmtCOP(Number(v.salarioNuevo))}</span>
                          {v.motivo && <span className="text-xs text-muted-foreground">· {v.motivo}</span>}
                        </li>
                      )
                    })}
                  </ul>
                </CardContent></Card>
              )}

              {principal && (
                <div className="pt-2">
                  <h3 className="flex items-center gap-2 text-sm font-medium mb-3"><FileText className="size-4" /> Documento del contrato {contratos[0]?.numero ?? contratosOps[0]?.numero}</h3>
                  <GestorDocumentos
                    entidadTipo={principal.tipo}
                    entidadId={principal.id}
                    sedeId={principal.sedeId}
                    documentos={contratoDocs.map((d) => ({
                      id: d.id, nombre: d.nombre, tipoDocumentoNombre: d.tipoDocumento?.nombre ?? null,
                      mimeType: d.mimeType, tamanoBytes: d.tamanoBytes,
                      fechaVencimiento: formatFechaISO(d.fechaVencimiento) || null, creadoEn: d.creadoEn.toISOString(),
                    }))}
                    tiposDocumento={tiposDocumento.map((t) => ({ id: t.id, nombre: t.nombre, requiereVencimiento: t.requiereVencimiento }))}
                    semaforo={[]}
                    puedeEditar={puedeEditar}
                  />
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* Documentos */}
        <TabsContent value="documentos">
          <GestorDocumentos
            entidadTipo="Colaborador"
            entidadId={c.id}
            sedeId={c.sedeId}
            documentos={documentosVisibles.map((d) => ({
              id: d.id,
              nombre: d.nombre,
              tipoDocumentoNombre: d.tipoDocumento?.nombre ?? null,
              mimeType: d.mimeType,
              tamanoBytes: d.tamanoBytes,
              fechaVencimiento: formatFechaISO(d.fechaVencimiento) || null,
              creadoEn: d.creadoEn.toISOString(),
            }))}
            tiposDocumento={tiposDocumento.map((t) => ({ id: t.id, nombre: t.nombre, requiereVencimiento: t.requiereVencimiento }))}
            semaforo={semaforo}
            puedeEditar={puedeEditar}
          />
        </TabsContent>

        {/* Educación */}
        <TabsContent value="educacion" className="space-y-4">
          <EducacionLista
            colaboradorId={c.id}
            items={c.educacion.map((e) => ({
              id: e.id, nivel: e.nivel, titulo: e.titulo, institucion: e.institucion,
              fechaGrado: formatFechaISO(e.fechaGrado) || null, enCurso: e.enCurso,
              certificadoDocId: certDocPorEdu.get(e.id) ?? null,
            }))}
            puedeEditar={puedeEditar}
          />

          {/* Historial de capacitaciones internas (RIT art. 95) */}
          <Card><CardContent className="py-4">
            <h3 className="mb-3 text-sm font-medium">Capacitaciones internas ({capacitacionesColab.length})</h3>
            {capacitacionesColab.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Sin capacitaciones registradas.</p>
            ) : (
              <ul className="divide-y">
                {capacitacionesColab.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{a.capacitacion.titulo}</span>
                    <Badge variant="outline" className="text-[10px]">{TIPO_CAPACITACION[a.capacitacion.tipo] ?? a.capacitacion.tipo}</Badge>
                    <span className="text-xs text-muted-foreground">{formatFechaCorta(a.capacitacion.fecha)}</span>
                    {a.evaluacion != null && <Badge variant="secondary" className="tabular-nums text-[10px]">Nota {Number(a.evaluacion)}</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent></Card>
        </TabsContent>

        {/* Pagos: desprendibles de nómina */}
        {mostrarPagos && (
          <TabsContent value="pagos">
            <Card><CardContent className="p-0 divide-y">
              {liquidaciones.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Aún no hay desprendibles de pago. Se generan al liquidar la nómina.</p>
              ) : liquidaciones.map((l) => (
                <div key={l.id} className="flex items-center gap-3 p-3">
                  <Receipt className="size-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{l.periodo.nombre}</p>
                    <p className="text-xs text-muted-foreground">Neto {fmtCOP(Number(l.neto))}</p>
                  </div>
                  {l.documentoId && (
                    <Button size="sm" variant="outline" asChild>
                      <a href={`/api/documentos/${l.documentoId}`} target="_blank" rel="noreferrer"><Download className="size-4" /> Desprendible</a>
                    </Button>
                  )}
                </div>
              ))}
            </CardContent></Card>
          </TabsContent>
        )}
      </TabsResponsive>
    </div>
  )
}

