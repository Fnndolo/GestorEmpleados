import Link from 'next/link'
import { esOps } from '@/lib/tramites-vinculo'
import { notFound } from 'next/navigation'
import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { documentosRequeridosDe } from '@/server/expediente'
import { whereColaboradores } from '@/server/consultas/colaboradores'
import { Encabezado } from '@/components/shell/encabezado'
import { Button, buttonVariants } from '@/components/ui/button'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { TabsContent } from '@/components/ui/tabs'
import { TabsResponsive } from '@/components/shell/tabs-responsive'
import {
  Pencil, ShieldAlert, CalendarDays, FileText, Eye, Receipt,
  IdCard, Landmark, Shirt, CalendarRange, Banknote, CalendarClock, CircleCheck, Clock, ChevronRight, TriangleAlert,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Stat } from '@/components/ui-kit'
import { fmtCOP } from '@/lib/moneda'
import { saldoVacaciones } from '@/server/vacaciones'
import { GestorDocumentos } from '@/components/documentos/gestor-documentos'
import { historialSolicitudes } from '@/server/solicitudes-historial'
import { HistorialSolicitudes } from '@/components/solicitudes/historial-solicitudes'
import { documentosDeOtroModulo } from '@/server/documentos'
import { valorParametroVigente } from '@/server/nomina/parametros'
import { TarjetaContrato } from '@/components/contratos/tarjeta-contrato'
import { TIPO_LABORAL_CORTO, firmaContratoLaboral, firmaContratoOps } from '@/lib/contratos/tarjeta'
import { fechaBreve, rangoBreve } from '@/lib/notificaciones/texto'
import { SubirContratoExistente } from './subir-contrato-existente'
import { FotoUploader } from './foto-uploader'
import { EducacionLista } from './educacion-lista'
import { BotonCertificacion } from './boton-certificacion'
import { BotonDisciplinario } from './boton-disciplinario'
import { RegistrarDisfrute } from './registrar-disfrute'
import { HistorialVacaciones } from './historial-vacaciones'
import { urlFoto } from '@/lib/foto'
import { HistorialDisciplinario, type ItemHistorial } from './historial-disciplinario'
import { formatFechaLarga, formatFechaISO, formatFechaCorta, calcularEdad, antiguedad, hoyBogota, duracionContrato } from '@/lib/fechas'

const TIPO_CAPACITACION: Record<string, string> = { INDUCCION: 'Inducción', REINDUCCION: 'Reinducción', FORMACION: 'Formación', SST: 'SST' }

/**
 * Tipo del catálogo que ya NO se sube al expediente: el contrato se gestiona en el módulo
 * de Contratos (crear desde plantilla, o «Subir contrato existente»). Se excluye del
 * selector para no duplicar el archivo, y su casilla del semáforo se resuelve desde ahí.
 */
const TIPO_CONTRATO_FIRMADO = 'Contrato firmado'
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
  // Registrar vacaciones ya tomadas es una novedad, como programarlas.
  const puedeNovedades = tienePermiso(usuario, 'novedades', 'CREAR')
  const verSalud = tienePermiso(usuario, 'colaboradores_salud', 'VER')
  const puedeDisciplinar = tienePermiso(usuario, 'juridica', 'CREAR')
  const verDisciplinario = tienePermiso(usuario, 'juridica', 'VER')
  const puedeBorrarLlamado = tienePermiso(usuario, 'juridica', 'ELIMINAR')
  // El botón "Ver contrato" lleva a la ruta administrativa; sin este permiso
  // (p. ej. un empleado viendo su propia ficha) daría "sin permiso": se
  // reemplaza por el enlace de autoservicio (OPS) o se oculta (laboral).
  const puedeVerContratos = tienePermiso(usuario, 'contratos', 'VER')
  // El historial de solicitudes lo ve quien aprueba (jefes, Talento Humano, administración).
  const puedeAprobar = tienePermiso(usuario, 'autoservicio', 'APROBAR')

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
    documentosRequeridosDe({ tipoVinculo: c.tipoVinculo, cargoId: c.cargoId }),
    prisma.tipoDocumento.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }),
  ])

  // Los desprendibles los ve quien tiene permiso de nómina o el propio colaborador (su ficha)
  const esPropia = usuario.colaboradorId === id
  // En su propia ficha el colaborador sube documentos igual que en Autoservicio →
  // Mis documentos (la API ya lo permite y avisa a Talento Humano); borrar no.
  const puedeSubirPropios = esPropia && tienePermiso(usuario, 'autoservicio', 'CREAR')
  const mostrarPagos = tienePermiso(usuario, 'nomina', 'VER') || esPropia
  const [contratos, contratosOps, eduDocs, liquidaciones, variacionesSalariales, auxTransporte] = await Promise.all([
    prisma.contrato.findMany({ where: { colaboradorId: id }, include: { cargo: true, sede: true }, orderBy: { fechaInicio: 'desc' } }),
    prisma.contratoOps.findMany({ where: { colaboradorId: id }, include: { sede: true }, orderBy: { fechaInicio: 'desc' } }),
    prisma.documento.findMany({ where: { entidadTipo: 'EducacionColaborador', entidadId: { in: c.educacion.map((e) => e.id) } }, select: { id: true, entidadId: true } }),
    mostrarPagos
      ? prisma.liquidacionNomina.findMany({ where: { colaboradorId: id, documentoId: { not: null } }, include: { periodo: { select: { nombre: true } } }, orderBy: { creadoEn: 'desc' }, take: 60 })
      : Promise.resolve([]),
    // Historial de variaciones salariales (requerimiento 3.4); cada otrosí de salario crea una.
    prisma.variacionSalarial.findMany({ where: { colaboradorId: id }, orderBy: { fechaVigencia: 'desc' } }),
    // Valor legal vigente del auxilio de transporte, para mostrarlo al subir un contrato.
    valorParametroVigente('AUX_TRANSPORTE'),
  ])

  // Pestaña Contrato: la misma tarjeta que el colaborador ve en su autoservicio,
  // con los PDF de cada contrato (el más reciente primero, laboral u OPS).
  const docsContratos = await prisma.documento.findMany({
    where: {
      OR: [
        { entidadTipo: 'Contrato', entidadId: { in: contratos.map((ct) => ct.id) } },
        { entidadTipo: 'ContratoOps', entidadId: { in: contratosOps.map((ct) => ct.id) } },
      ],
    },
    orderBy: { creadoEn: 'desc' },
    select: { id: true, entidadId: true, nombre: true },
  })
  const docsDe = (contratoId: string) => docsContratos.filter((d) => d.entidadId === contratoId)
  const tarjetasContrato = [
    ...contratos.map((ct, i) => {
      // La interrupción con el contrato anterior (la lista va del más nuevo al
      // más viejo) define si la relación laboral es continua para antigüedad y
      // prestaciones, así que se muestra explícita.
      const anterior = contratos[i + 1]
      const diasInterrupcion = anterior?.fechaFin
        ? Math.round((ct.fechaInicio.getTime() - anterior.fechaFin.getTime()) / 86_400_000) - 1
        : null
      return {
        id: ct.id,
        fechaMs: ct.fechaInicio.getTime(),
        datos: {
          numero: ct.numero,
          estado: ct.estado,
          firma: firmaContratoLaboral(ct),
          resumen: [ct.cargo?.nombre, TIPO_LABORAL_CORTO[ct.tipo] ?? ct.tipo].filter(Boolean).join(' · '),
          vigenciaCorta: ct.fechaFin ? rangoBreve(ct.fechaInicio, ct.fechaFin) : `Desde ${fechaBreve(ct.fechaInicio)}`,
          valor: `${fmtCOP(Number(ct.salarioBase))}/mes`,
          documentos: docsDe(ct.id),
        },
        firmas: ct.origenPdf === 'SUBIDO' ? null : [
          { parte: 'Empleado', fecha: ct.firmaEmpleadoFecha, enPdf: false, pendiente: 'firma desde su autoservicio' },
          { parte: 'Empleador', fecha: ct.firmaEmpleadorFecha, enPdf: ct.firmaEmpleadorEnPdf, pendiente: 'pendiente' },
        ],
        detalles: [
          [
            ct.ganaSalarioMinimo ? 'Salario mínimo' : null,
            ct.tieneAuxTransporte ? 'con auxilio de transporte' : 'sin auxilio de transporte',
            ct.auxConectividad ? `conectividad ${fmtCOP(Number(ct.auxConectividad))}` : null,
          ].filter(Boolean).join(' · '),
          `${ct.sede.nombre} · ${duracionContrato(ct.fechaInicio, ct.fechaFin)}`,
          anterior?.fechaFin && diasInterrupcion != null
            ? `Contrato anterior (${anterior.numero}) terminó el ${formatFechaLarga(anterior.fechaFin)}${diasInterrupcion <= 0 ? ' · sin interrupción' : ` · ${diasInterrupcion} día${diasInterrupcion > 1 ? 's' : ''} de interrupción`}`
            : null,
        ].filter((d): d is string => !!d),
        href: puedeVerContratos ? `/contratos/${ct.id}` : null,
      }
    }),
    ...contratosOps.map((ct) => ({
      id: ct.id,
      fechaMs: ct.fechaInicio.getTime(),
      datos: {
        numero: ct.numero,
        estado: ct.estado,
        firma: firmaContratoOps(ct),
        resumen: ct.objeto.replace(/^Prestación de servicios como\s+/i, ''),
        vigenciaCorta: rangoBreve(ct.fechaInicio, ct.fechaFin),
        valor: ct.valorMensual ? `${fmtCOP(Number(ct.valorMensual))}/mes` : fmtCOP(Number(ct.valorTotal)),
        documentos: docsDe(ct.id),
      },
      firmas: ct.origenPdf === 'SUBIDO' ? null : [
        { parte: 'Contratista', fecha: ct.firmaContratistaFecha, enPdf: false, pendiente: 'firma desde su autoservicio' },
        { parte: 'Contratante', fecha: ct.firmaContratanteFecha, enPdf: ct.firmaContratanteEnPdf, pendiente: 'pendiente' },
      ],
      detalles: [`Prestación de servicios · ${ct.sede.nombre} · ${duracionContrato(ct.fechaInicio, ct.fechaFin)}`],
      href: puedeVerContratos ? `/contratos/ops/${ct.id}` : '/autoservicio/contratos',
    })),
  ].sort((a, b) => b.fechaMs - a.fechaMs)

  // Capacitaciones internas del colaborador (RIT art. 95) para la pestaña Educación.
  const capacitacionesColab = await prisma.asistenciaCapacitacion.findMany({
    where: { colaboradorId: id },
    include: { capacitacion: true },
    orderBy: { capacitacion: { fecha: 'desc' } },
  })

  // Historial disciplinario: solo se consulta si el usuario puede verlo. Para
  // un empleado mirando su propia ficha estas dos consultas sobran.
  const [llamados, procesos] = verDisciplinario
    ? await Promise.all([
        prisma.llamadoAtencion.findMany({ where: { colaboradorId: id }, orderBy: { fecha: 'desc' } }),
        prisma.procesoDisciplinario.findMany({ where: { colaboradorId: id }, orderBy: { fechaApertura: 'desc' } }),
      ])
    : [[], []]

  // Se mezclan y ordenan por fecha: la secuencia es justamente lo que se lee
  // (dos llamados y luego un proceso no es lo mismo que al revés).
  const historial: ItemHistorial[] = [
    ...llamados.map((l) => ({
      orden: l.fecha.getTime(),
      item: {
        clase: 'llamado' as const, id: l.id, fecha: formatFechaCorta(l.fecha),
        tipo: l.tipo, motivo: l.motivo, detalle: l.detalle,
      },
    })),
    ...procesos.map((pr) => ({
      orden: pr.fechaApertura.getTime(),
      item: {
        clase: 'proceso' as const, id: pr.id, fecha: formatFechaCorta(pr.fechaApertura),
        asunto: pr.asunto, etapa: pr.etapa as string, cerrado: pr.cerrado, decision: pr.decision,
      },
    })),
  ]
    .sort((a, b) => b.orden - a.orden)
    .map((x) => x.item)

  const certDocPorEdu = new Map<string, string>()
  for (const d of eduDocs) if (!certDocPorEdu.has(d.entidadId)) certDocPorEdu.set(d.entidadId, d.id)

  // Documentos visibles: por nivel de acceso, y sin los que pertenecen a otro
  // módulo. Los desprendibles viven en la pestaña Pagos, las actas en Activos y
  // los exámenes en SST: repetirlos aquí llena la hoja de vida —24 desprendibles
  // al año por persona— y esconde lo que de verdad falta del expediente.
  // Los propios se ven todos (habeas data), como en Mis documentos: si no, un
  // documento que le subió TH con nivel RRHH le aparecía "al día" sin poder abrirlo.
  const deOtroModulo = await documentosDeOtroModulo(id)
  const documentosVisibles = documentos.filter(
    (d) =>
      !deOtroModulo.has(d.id) &&
      (esPropia || d.nivelAcceso === 'GENERAL' || verSalud || (d.nivelAcceso === 'RRHH' && puedeEditar)),
  )

  // Semáforo documental
  const hoy = hoyBogota()
  const en30 = new Date(hoy)
  en30.setUTCDate(en30.getUTCDate() + 30)
  const porTipo = new Map<string, typeof documentos[number]>()
  // Vienen del más reciente al más antiguo: el primero de cada tipo es el vigente.
  for (const d of documentos) if (d.tipoDocumentoId && !porTipo.has(d.tipoDocumentoId)) porTipo.set(d.tipoDocumentoId, d)
  // El contrato NO vive en el expediente: se gestiona en el módulo de Contratos. Por eso
  // este requisito se resuelve mirando los contratos del colaborador (firmados en la app
  // por ambas partes, o subidos ya firmados en físico) en vez de exigir una copia duplicada.
  const tieneContratoFirmado =
    contratos.some((ct) => ct.origenPdf === 'SUBIDO' || (ct.firmaEmpleadoPath && ct.firmaEmpleadorPath)) ||
    contratosOps.some((ct) => ct.origenPdf === 'SUBIDO' || (ct.firmaContratistaPath && (ct.firmaContratantePath || ct.firmaContratanteEnPdf)))
  const semaforo = requeridos.map((r) => {
    if (r.tipoDocumento.nombre === TIPO_CONTRATO_FIRMADO) {
      return { nombre: r.tipoDocumento.nombre, obligatorio: r.obligatorio, estado: (tieneContratoFirmado ? 'al_dia' : 'falta') as 'al_dia' | 'falta' }
    }
    const doc = porTipo.get(r.tipoDocumentoId)
    let estado: 'al_dia' | 'falta' | 'vencido' | 'por_vencer' = 'falta'
    if (doc) {
      if (doc.fechaVencimiento && doc.fechaVencimiento < hoy) estado = 'vencido'
      else if (doc.fechaVencimiento && doc.fechaVencimiento <= en30) estado = 'por_vencer'
      else estado = 'al_dia'
    }
    return { nombre: r.tipoDocumento.nombre, obligatorio: r.obligatorio, estado, tipoDocumentoId: r.tipoDocumentoId, documentoId: doc?.id ?? null }
  })

  const edad = calcularEdad(c.fechaNacimiento)
  const solicitudes = puedeAprobar ? await historialSolicitudes({ colaboradorId: id, take: 100 }) : []

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

  // Enlace para completar los datos que falten (quien edita la ficha, o la propia persona).
  const enlaceEditar = puedeEditar ? `/colaboradores/${id}/editar` : esPropia ? '/autoservicio/mi-informacion' : null
  const tallas: DatoFicha[] = [['Camisa', c.tallaCamisa], ['Pantalón', c.tallaPantalon], ['Calzado', c.tallaCalzado]]

  return (
    <div className="max-w-6xl">
      <Encabezado
        titulo="Ficha del colaborador"
        enLinea
        volver
        acciones={
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href={`/colaboradores/${id}/calendario`}><CalendarDays className="size-4" /> <span className="hidden sm:inline">Calendario</span></Link>
            </Button>
            {puedeDisciplinar && <BotonDisciplinario colaboradorId={id} nombre={`${c.nombres} ${c.apellidos}`} esOps={esOps(c.tipoVinculo)} />}
            {puedeEditar && (
              <>
                <BotonCertificacion colaboradorId={id} />
                <Button asChild size="sm">
                  <Link href={`/colaboradores/${id}/editar`}><Pencil className="size-4" /> <span className="hidden sm:inline">Editar</span></Link>
                </Button>
              </>
            )}
            {/* En su propia ficha, sin permiso de editar, el lápiz lleva a
                Mi información: es donde cada persona actualiza sus datos. */}
            {!puedeEditar && esPropia && (
              <Button asChild size="sm">
                <Link href="/autoservicio/mi-informacion" aria-label="Editar mi información"><Pencil className="size-4" /> <span className="hidden sm:inline">Editar</span></Link>
              </Button>
            )}
          </div>
        }
      />

      {/* Héroe */}
      <Card className="mb-4 overflow-hidden">
        <CardContent className="py-5">
          {/* Foto a la izquierda y datos a la derecha también en el celular: apilados,
              la foto sola ocupaba media pantalla antes de leer el nombre. */}
          <div className="flex items-start gap-3 sm:items-center sm:gap-4">
            <div className="flex shrink-0 flex-col items-center gap-2">
              <FotoUploader
                colaboradorId={c.id}
                iniciales={iniciales(c.nombres, c.apellidos)}
                nombreCompleto={`${c.nombres} ${c.apellidos}`}
                fotoUrl={urlFoto(c.id, c.fotoPath)}
                puedeEditar={puedeEditar}
              />
              {/* El estado va bajo la foto: aprovecha ese espacio y deja la fila
                  de la derecha para vínculo, modalidad y sede. */}
              <span className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold',
                c.estado === 'ACTIVO'
                  ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400'
                  : 'bg-foreground/8 text-muted-foreground',
              )}>
                <span className={cn('size-1.5 rounded-full', c.estado === 'ACTIVO' ? 'bg-emerald-500' : 'bg-muted-foreground')} />
                {ESTADO_COLABORADOR[c.estado]}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold leading-tight tracking-tight sm:text-xl">{c.nombres} {c.apellidos}</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {c.cargo?.nombre ?? 'Sin cargo'}{c.area && ` · ${c.area.nombre}`}
                {c.jefeInmediato && ` · reporta a ${c.jefeInmediato.nombres} ${c.jefeInmediato.apellidos}`}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
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
        <Stat icono={CalendarClock} color="bg-foreground text-background"
          valor={antiguedad(c.fechaIngreso)} label={`Antigüedad · desde ${formatFechaLarga(c.fechaIngreso)}`} />
        {salarioActual && (
          <Stat icono={Banknote} color="bg-foreground text-background"
            valor={salarioActual} label={contratoActivo ? 'Salario base actual' : 'Honorarios OPS'} />
        )}
        <Stat
          icono={FileText}
          color="bg-foreground text-background"
          valor={`${docsAlDia} de ${semaforo.length}`}
          label={`Documentos al día${docsPorVencer > 0 ? ` · ${docsPorVencer} por vencer` : ''}${docsFaltan > 0 ? ` · ${docsFaltan} falta${docsFaltan > 1 ? 'n' : ''}` : ''}`}
        />
        {/* Un contrato de prestación de servicios no causa vacaciones. */}
        {!esOps(c.tipoVinculo) && (
          <Stat icono={CalendarRange} color="bg-foreground text-background"
            valor={`${saldoVac.saldoEntero} días`} label={saldoVac.saldoEntero < 0 ? 'Vacaciones anticipadas' : 'Vacaciones disponibles'} />
        )}
      </div>

      <TabsResponsive
        items={[
          { valor: 'resumen', label: 'Resumen' },
          { valor: 'contrato', label: 'Contrato' },
          { valor: 'documentos', label: 'Documentos', alerta: semaforo.some((s) => s.obligatorio && s.estado === 'falta') },
          { valor: 'educacion', label: 'Educación' },
          ...(puedeAprobar ? [{ valor: 'solicitudes', label: 'Solicitudes' }] : []),
          ...(verDisciplinario ? [{ valor: 'disciplinario', label: 'Disciplinario' }] : []),
          ...(mostrarPagos ? [{ valor: 'pagos', label: 'Pagos' }] : []),
        ]}
      >

        {/* Resumen */}
        {/* Resumen: lo de la persona en bloques compactos. Solo se muestran los
            datos que existen; los que faltan se nombran en una línea al final de
            cada bloque, con el enlace para completarlos. Lo laboral (cargo, jefe,
            vínculo, sede, ingreso) ya está arriba, en el encabezado y las cifras. */}
        <TabsContent value="resumen" className="grid items-start gap-3 lg:grid-cols-3">
          <BloqueFicha
            titulo="Datos personales"
            icono={IdCard}
            className="lg:col-span-2"
            editarHref={enlaceEditar}
            datos={[
              ['Documento', <span key="doc" title={TIPO_DOCUMENTO_IDENTIDAD[c.tipoDocumento]}>{c.tipoDocumento} {c.numeroDocumento}</span>],
              ['Expedición', [c.fechaExpedicionDoc ? formatFechaCorta(c.fechaExpedicionDoc) : null, c.lugarExpedicionDoc].filter(Boolean).join(' · ') || null],
              ['Nacimiento', c.fechaNacimiento ? `${formatFechaCorta(c.fechaNacimiento)}${edad !== null ? ` · ${edad} años` : ''}` : null],
              ['Celular', c.celular || null],
              ['Correo personal', c.emailPersonal, true],
              ['Dirección', [c.direccion, c.ciudadResidencia?.nombre].filter(Boolean).join(', ') || null, true],
              ['Género', c.genero ? GENERO[c.genero] : null],
              ['Estado civil', c.estadoCivil ? ESTADO_CIVIL[c.estadoCivil] : null],
              ['Grupo sanguíneo', c.grupoSanguineo ? GRUPO_SANGUINEO[c.grupoSanguineo] : null],
              ['Nivel educativo', c.nivelEducativoMax ? NIVEL_EDUCATIVO[c.nivelEducativoMax] : null],
              ['Contacto de emergencia', c.emergenciaNombre
                ? [c.emergenciaNombre, c.emergenciaParentesco, c.emergenciaTelefono].filter(Boolean).join(' · ')
                : null, true],
            ]}
          />

          {/* Vacaciones: cuentan desde el contrato de trabajo y se muestran en
              días completos. Las ya tomadas sin registro se anotan aquí. */}
          {!esOps(c.tipoVinculo) ? (
            <Card className="py-0">
              <CardContent className="p-4">
                <TituloBloque titulo="Vacaciones" icono={CalendarRange} />
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                  {/* Negativo: tomó días anticipados que aún no ha causado. */}
                  {saldoVac.saldoEntero < 0 ? (
                    <Campo k="Anticipadas" v={<span className="text-amber-700 dark:text-amber-400">Debe {-saldoVac.saldoEntero} días</span>} />
                  ) : (
                    <Campo k="Disponibles" v={`${saldoVac.saldoEntero} días`} />
                  )}
                  <Campo k="Causadas" v={`${Math.trunc(saldoVac.causadas)} días`} />
                  <Campo k="Disfrutadas" v={`${Math.trunc(saldoVac.disfrutadas)} días`} />
                  <Campo k="Causan desde" v={formatFechaCorta(saldoVac.desde)} />
                  {saldoVac.pendientesAprobacion > 0 && <Campo k="Pedidas, sin aprobar" v={`${Math.trunc(saldoVac.pendientesAprobacion)} días`} />}
                </dl>
                {puedeNovedades && (
                  <div className="mt-3 space-y-3">
                    <RegistrarDisfrute colaboradorId={id} hoyISO={formatFechaISO(hoyBogota())} />
                    <HistorialVacaciones
                      colaboradorId={id}
                      // Es un instante (no una fecha de negocio): se lee en hora de Colombia.
                      completoEn={c.vacacionesHistorialCompletoEn
                        ? new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric' }).format(c.vacacionesHistorialCompletoEn)
                        : null}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <BloqueFicha titulo="Tallas para dotación" icono={Shirt} editarHref={enlaceEditar} datos={tallas} />
          )}

          {verSalud ? (
            <BloqueFicha
              titulo="Seguridad social y pago"
              icono={ShieldAlert}
              nota="Sensible"
              className="lg:col-span-2"
              editarHref={enlaceEditar}
              datos={[
                ['EPS', c.eps?.nombre ?? null],
                ['Pensión', c.afp?.nombre ?? null],
                ['Cesantías', c.fondoCesantias?.nombre ?? null],
                ['Caja de compensación', c.cajaCompensacion?.nombre ?? null],
                ['ARL', [c.arl?.nombre, c.claseRiesgoArl ? CLASE_RIESGO_ARL[c.claseRiesgoArl] : null].filter(Boolean).join(' · ') || null],
                // Completo: es un dato operativo para pagar; este bloque solo lo ve quien puede ver datos sensibles.
                ['Cuenta', c.banco ? [c.banco.nombre, c.tipoCuenta ? TIPO_CUENTA[c.tipoCuenta] : null, c.numeroCuenta].filter(Boolean).join(' · ') : null, true],
              ]}
            />
          ) : puedeEditar ? (
            <BloqueFicha
              titulo="Datos bancarios"
              icono={Landmark}
              className="lg:col-span-2"
              editarHref={enlaceEditar}
              datos={[['Cuenta', c.banco ? [c.banco.nombre, c.tipoCuenta ? TIPO_CUENTA[c.tipoCuenta] : null, c.numeroCuenta].filter(Boolean).join(' · ') : null, true]]}
            />
          ) : (
            <Card className="py-0 lg:col-span-2"><CardContent className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <ShieldAlert className="size-4 shrink-0" /> La seguridad social es un dato sensible y no está disponible para tu perfil.
            </CardContent></Card>
          )}

          {!esOps(c.tipoVinculo) && <BloqueFicha titulo="Tallas para dotación" icono={Shirt} editarHref={enlaceEditar} datos={tallas} />}
        </TabsContent>

        {/* Contrato */}
        <TabsContent value="contrato" className="space-y-4">
          {/* Cargar un contrato que YA existe (firmado en físico). Los contratos nuevos
              se crean desde Contratación, con su plantilla y firma digital. */}
          {puedeEditar && puedeVerContratos && (
            <div className="flex justify-end">
              <SubirContratoExistente colaboradorId={c.id} sedeId={c.sedeId} cargoId={c.cargoId} auxTransporte={auxTransporte ?? 0} />
            </div>
          )}
          {contratos.length === 0 && contratosOps.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
              Este colaborador no tiene contratos registrados.
              {/* A Contratación, no directo al formulario laboral: desde ahí se elige
                  la modalidad (laboral u OPS) según el vínculo que corresponda. */}
              {puedeEditar && <> <Link href="/contratos" className="text-primary hover:underline">Crear contrato nuevo</Link>, o sube uno que ya exista con el botón de arriba.</>}
            </CardContent></Card>
          ) : (
            <>
              {/* La misma tarjeta del autoservicio: plegada muestra número, estado,
                  cargo y vigencia; abierta, los PDF, las firmas y los detalles. El
                  contrato vigente (el primero) se muestra abierto. */}
              {tarjetasContrato.map((t, i) => (
                <TarjetaContrato key={t.id} c={t.datos} abiertoInicial={i === 0}>
                  {t.datos.documentos.length === 0 && (
                    <p className="text-xs text-muted-foreground">Sin documento cargado.</p>
                  )}
                  {t.firmas ? (
                    t.datos.documentos.length > 0 && (
                      <ul className="space-y-1">
                        {t.firmas.map((f) => {
                          const firmo = !!f.fecha || f.enPdf
                          return (
                            <li key={f.parte} className={cn('flex items-center gap-1.5 text-xs', firmo ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400')}>
                              {firmo ? <CircleCheck className="size-3.5 shrink-0" /> : <Clock className="size-3.5 shrink-0" />}
                              <span>
                                <span className="font-medium">{f.parte}</span>
                                {' · '}
                                {f.fecha ? `firmó el ${formatFechaLarga(f.fecha)}` : f.enPdf ? 'firmó en el documento aportado' : f.pendiente}
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    )
                  ) : (
                    <p className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
                      <CircleCheck className="size-3.5 shrink-0" /> Firmado en físico
                    </p>
                  )}
                  {t.detalles.length > 0 && (
                    <div className="space-y-0.5 text-xs text-muted-foreground">
                      {t.detalles.map((d) => <p key={d}>{d}</p>)}
                    </div>
                  )}
                  {t.href && (
                    <Link href={t.href} className={cn(buttonVariants({ size: 'sm' }), 'w-full sm:w-auto')}>
                      Ver contrato <ChevronRight className="size-4" />
                    </Link>
                  )}
                </TarjetaContrato>
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

              {/* Los documentos y anexos de cada contrato (otrosíes, prórrogas, soportes) se
                  gestionan dentro del contrato — así funcionan para TODOS, no solo el último. */}
              <p className="pt-1 text-xs text-muted-foreground">
                Los documentos y anexos de cada contrato (otrosíes, prórrogas, soportes) se gestionan
                dentro de cada contrato, con «Ver contrato».
              </p>
            </>
          )}
        </TabsContent>

        {/* Documentos personales del colaborador (hoja de vida). Los papeles del
            contrato viven en la pestaña Contrato. */}
        <TabsContent value="documentos">
          <p className="mb-3 text-xs text-muted-foreground">
            Documentos personales del colaborador: cédula, diplomas, certificados y demás soportes de
            su hoja de vida. Los documentos del contrato están en la pestaña Contrato.
          </p>
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
            tiposDocumento={tiposDocumento
              .filter((t) => t.nombre !== TIPO_CONTRATO_FIRMADO)
              .map((t) => ({ id: t.id, nombre: t.nombre, requiereVencimiento: t.requiereVencimiento }))}
            semaforo={semaforo}
            puedeEditar={puedeEditar || puedeSubirPropios}
            puedeBorrar={puedeEditar}
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
            {/* La inducción es obligatoria (RIT arts. 7 y 95): a los 15 días del ingreso
                sin ella, Talento Humano recibe un aviso. Aquí se dice si ya la tiene. */}
            {(() => {
              const induccion = capacitacionesColab.find((a) => a.capacitacion.tipo === 'INDUCCION')
              return induccion ? (
                <p className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-300">
                  <CircleCheck className="size-4 shrink-0" /> Inducción realizada el {formatFechaCorta(induccion.capacitacion.fecha)}
                </p>
              ) : (
                <p className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                  <TriangleAlert className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1">Necesita inducción: no tiene ninguna registrada. Se registra en Capacitaciones, con una de tipo «Inducción» y su asistencia.</span>
                  <Link href="/capacitaciones" className="font-medium underline underline-offset-2">Ir a Capacitaciones</Link>
                </p>
              )
            })()}
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

        {/* Solicitudes de autoservicio: todas, con quién las decidió. */}
        {puedeAprobar && (
          <TabsContent value="solicitudes">
            <HistorialSolicitudes items={solicitudes} vacio="Esta persona no ha hecho solicitudes." />
          </TabsContent>
        )}

        {/* Historial disciplinario: llamados de atención + procesos, en una sola línea de tiempo */}
        {verDisciplinario && (
          <TabsContent value="disciplinario" className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Los llamados de atención son correctivos y quedan como antecedente. Los procesos
              disciplinarios son los que pueden terminar en sanción y se gestionan en Jurídica.
              Ambos se registran con el botón «Disciplinario» de arriba.
            </p>
            <HistorialDisciplinario puedeEliminar={puedeBorrarLlamado} items={historial} />
          </TabsContent>
        )}

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
                    <VisorPdf
                      documentoId={l.documentoId}
                      titulo={`Desprendible ${l.periodo.nombre}`}
                      className={buttonVariants({ size: 'sm' })}
                    >
                      <Eye className="size-4" /> Desprendible
                    </VisorPdf>
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


/** [etiqueta, valor o null si no está registrado, ocupa toda la fila]. */
type DatoFicha = [string, React.ReactNode | null | undefined, boolean?]

function TituloBloque({ titulo, icono: Icono, nota }: { titulo: string; icono: typeof IdCard; nota?: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icono className="size-4 shrink-0 text-muted-foreground" />
      <h3 className="text-sm font-semibold">{titulo}</h3>
      {nota && <span className="ml-auto text-[11px] font-medium text-amber-700 dark:text-amber-400">{nota}</span>}
    </div>
  )
}

function Campo({ k, v, ancho }: { k: string; v: React.ReactNode; ancho?: boolean }) {
  return (
    <div className={cn('min-w-0', ancho && 'col-span-2')}>
      <dt className="text-[11px] text-muted-foreground">{k}</dt>
      <dd className="break-words text-sm font-medium">{v}</dd>
    </div>
  )
}

/**
 * Un bloque de la ficha: solo los datos que existen, en cuadrícula (2 columnas
 * en el celular, 3 en pantalla ancha); los que faltan, en una línea al final.
 */
function BloqueFicha({ titulo, icono, datos, nota, className, editarHref }: {
  titulo: string
  icono: typeof IdCard
  datos: DatoFicha[]
  nota?: string
  className?: string
  editarHref: string | null
}) {
  const conDato = datos.filter(([, v]) => v !== null && v !== undefined && v !== '')
  const faltan = datos.filter(([, v]) => v === null || v === undefined || v === '').map(([k]) => k)
  const ancho = className?.includes('col-span-2')
  return (
    <Card className={cn('py-0', className)}>
      <CardContent className="p-4">
        <TituloBloque titulo={titulo} icono={icono} nota={nota} />
        {conDato.length > 0 && (
          <dl className={cn('grid grid-cols-2 gap-x-4 gap-y-2.5', ancho && 'sm:grid-cols-3')}>
            {conDato.map(([k, v, completo]) => <Campo key={k} k={k} v={v} ancho={completo} />)}
          </dl>
        )}
        {faltan.length > 0 && (
          <p className={cn('text-xs text-muted-foreground', conDato.length > 0 && 'mt-3 border-t pt-2.5')}>
            Sin registrar: {faltan.join(', ')}
            {editarHref && <> · <Link href={editarHref} className="font-medium text-primary hover:underline">Completar</Link></>}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
