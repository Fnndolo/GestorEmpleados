import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Pencil, Phone, Briefcase, ShieldAlert, CalendarDays } from 'lucide-react'
import { GestorDocumentos } from '@/components/documentos/gestor-documentos'
import { FotoUploader } from './foto-uploader'
import { EducacionLista } from './educacion-lista'
import { BotonCertificacion } from './boton-certificacion'
import { formatFechaLarga, formatFechaISO, calcularEdad, antiguedad, hoyBogota } from '@/lib/fechas'
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

  const c = await prisma.colaborador.findUnique({
    where: { id },
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

  return (
    <div className="mx-auto max-w-4xl">
      <Encabezado
        titulo="Ficha del colaborador"
        acciones={
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={`/colaboradores/${id}/calendario`}><CalendarDays className="size-4" /> Calendario</Link>
            </Button>
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

      {/* Cabecera */}
      <Card className="mb-4">
        <CardContent className="flex flex-col sm:flex-row sm:items-center gap-4 py-5">
          <FotoUploader
            colaboradorId={c.id}
            iniciales={iniciales(c.nombres, c.apellidos)}
            tieneFoto={Boolean(c.fotoPath)}
            puedeEditar={puedeEditar}
          />
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold">{c.nombres} {c.apellidos}</h2>
            <p className="text-sm text-muted-foreground">
              {c.cargo?.nombre ?? 'Sin cargo'}{c.area && ` · ${c.area.nombre}`}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <Badge variant="outline">{TIPO_VINCULO[c.tipoVinculo]}</Badge>
              <Badge variant="outline">{MODALIDAD_TRABAJO[c.modalidadTrabajo]}</Badge>
              <Badge variant="outline">{c.sede.nombre} · {c.sede.ciudad.nombre}</Badge>
              <Badge variant={c.estado === 'ACTIVO' ? 'default' : 'secondary'}>{ESTADO_COLABORADOR[c.estado]}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="resumen">
        <TabsList>
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="documentos">
            Documentos {semaforo.some((s) => s.obligatorio && s.estado === 'falta') && <span className="ml-1 text-destructive">•</span>}
          </TabsTrigger>
          <TabsTrigger value="educacion">Educación</TabsTrigger>
        </TabsList>

        {/* Resumen */}
        <TabsContent value="resumen" className="space-y-4">
          <BloqueDatos titulo="Identificación" datos={[
            ['Documento', `${TIPO_DOCUMENTO_IDENTIDAD[c.tipoDocumento]} ${c.numeroDocumento}`],
            ['Fecha de nacimiento', c.fechaNacimiento ? `${formatFechaLarga(c.fechaNacimiento)}${edad !== null ? ` (${edad} años)` : ''}` : '—'],
            ['Género', c.genero ? GENERO[c.genero] : '—'],
            ['Estado civil', c.estadoCivil ? ESTADO_CIVIL[c.estadoCivil] : '—'],
            ['Grupo sanguíneo', c.grupoSanguineo ? GRUPO_SANGUINEO[c.grupoSanguineo] : '—'],
            ['Nivel educativo', c.nivelEducativoMax ? NIVEL_EDUCATIVO[c.nivelEducativoMax] : '—'],
          ]} />

          <BloqueDatos titulo="Contacto" icono={<Phone className="size-4" />} datos={[
            ['Celular', c.celular],
            ['Teléfono', c.telefono ?? '—'],
            ['Correo personal', c.emailPersonal ?? '—'],
            ['Correo corporativo', c.emailCorporativo ?? '—'],
            ['Dirección', [c.direccion, c.barrio, c.ciudadResidencia?.nombre].filter(Boolean).join(', ') || '—'],
          ]} />

          <BloqueDatos titulo="Contacto de emergencia" datos={[
            ['Nombre', c.emergenciaNombre ?? '—'],
            ['Parentesco', c.emergenciaParentesco ?? '—'],
            ['Teléfono', c.emergenciaTelefono ?? '—'],
          ]} />

          <BloqueDatos titulo="Información laboral" icono={<Briefcase className="size-4" />} datos={[
            ['Vínculo', TIPO_VINCULO[c.tipoVinculo]],
            ['Modalidad', MODALIDAD_TRABAJO[c.modalidadTrabajo]],
            ['Sede', `${c.sede.nombre} · ${c.sede.ciudad.nombre}`],
            ['Área', c.area?.nombre ?? '—'],
            ['Cargo', c.cargo?.nombre ?? '—'],
            ['Jefe inmediato', c.jefeInmediato ? `${c.jefeInmediato.nombres} ${c.jefeInmediato.apellidos}` : '—'],
            ['Fecha de ingreso', `${formatFechaLarga(c.fechaIngreso)} (${antiguedad(c.fechaIngreso)})`],
          ]} />

          {verSalud ? (
            <BloqueDatos titulo="Seguridad social" icono={<ShieldAlert className="size-4 text-amber-500" />} nota="Información sensible (Ley 1581)." datos={[
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
            <BloqueDatos titulo="Datos bancarios" datos={[
              ['Banco', c.banco?.nombre ?? '—'],
              ['Tipo de cuenta', c.tipoCuenta ? TIPO_CUENTA[c.tipoCuenta] : '—'],
              ['Número de cuenta', c.numeroCuenta ?? '—'],
            ]} />
          )}

          <BloqueDatos titulo="Tallas para dotación" datos={[
            ['Camisa', c.tallaCamisa ?? '—'],
            ['Pantalón', c.tallaPantalon ?? '—'],
            ['Calzado', c.tallaCalzado ?? '—'],
          ]} />
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
        <TabsContent value="educacion">
          <EducacionLista
            colaboradorId={c.id}
            items={c.educacion.map((e) => ({
              id: e.id, nivel: e.nivel, titulo: e.titulo, institucion: e.institucion,
              fechaGrado: formatFechaISO(e.fechaGrado) || null, enCurso: e.enCurso,
            }))}
            puedeEditar={puedeEditar}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function BloqueDatos({
  titulo, icono, nota, datos,
}: {
  titulo: string; icono?: React.ReactNode; nota?: string; datos: [string, string][]
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <h3 className="flex items-center gap-2 text-sm font-medium mb-3">{icono}{titulo}</h3>
        {nota && <p className="text-xs text-muted-foreground -mt-2 mb-3">{nota}</p>}
        <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
          {datos.map(([k, val]) => (
            <div key={k} className="flex flex-col">
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="text-sm">{val}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}
