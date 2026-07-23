import { notFound } from 'next/navigation'
import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatFechaLarga, formatFechaISO } from '@/lib/fechas'
import { Asistencia } from './asistencia'
import { GestorDocumentos } from '@/components/documentos/gestor-documentos'

export const metadata = { title: 'Capacitación · Smart Gadgets RH' }

const TIPO: Record<string, string> = { INDUCCION: 'Inducción', REINDUCCION: 'Reinducción', FORMACION: 'Formación', SST: 'SST' }

export default async function CapacitacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const usuario = await requerirPermiso('capacitaciones', 'VER')
  const puedeEditar = tienePermiso(usuario, 'capacitaciones', 'EDITAR')

  const c = await prisma.capacitacion.findUnique({
    where: { id },
    include: { asistencias: { include: { colaborador: { select: { nombres: true, apellidos: true } } }, orderBy: { colaborador: { apellidos: 'asc' } } } },
  })
  if (!c) notFound()

  const [colaboradores, documentos, tiposDocumento] = await Promise.all([
    prisma.colaborador.findMany({
      where: { estado: 'ACTIVO' },
      select: { id: true, nombres: true, apellidos: true, sede: { select: { nombre: true } } },
      orderBy: [{ apellidos: 'asc' }, { nombres: 'asc' }],
    }),
    // Soporte: lista de asistencia firmada, material, certificados…
    prisma.documento.findMany({
      where: { entidadTipo: 'Capacitacion', entidadId: id },
      include: { tipoDocumento: { select: { nombre: true } } },
      orderBy: { creadoEn: 'desc' },
    }),
    prisma.tipoDocumento.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }),
  ])

  return (
    <div className="mx-auto max-w-3xl">
      <Encabezado titulo={c.titulo} descripcion={`${TIPO[c.tipo]} · ${formatFechaLarga(c.fecha)}`} acciones={<Badge variant="outline">{c.asistencias.length} asistentes</Badge>} />
      {c.descripcion && <Card className="mb-4"><CardContent className="py-3 text-sm text-muted-foreground">{c.descripcion}</CardContent></Card>}
      <Asistencia
        capacitacionId={c.id}
        puedeEditar={puedeEditar}
        asistentes={c.asistencias.map((a) => ({ id: a.id, colaboradorId: a.colaboradorId, colaborador: `${a.colaborador.nombres} ${a.colaborador.apellidos}`, evaluacion: a.evaluacion ? Number(a.evaluacion) : null }))}
        colaboradores={colaboradores.map((x) => ({ id: x.id, nombre: `${x.apellidos} ${x.nombres}`, sede: x.sede.nombre }))}
      />

      {/* Evidencia de la capacitación: lista firmada escaneada, material, certificados. */}
      <div className="mt-6">
        <GestorDocumentos
          entidadTipo="Capacitacion"
          entidadId={c.id}
          sedeId={null}
          documentos={documentos.map((d) => ({
            id: d.id, nombre: d.nombre, tipoDocumentoNombre: d.tipoDocumento?.nombre ?? null,
            mimeType: d.mimeType, tamanoBytes: d.tamanoBytes,
            fechaVencimiento: formatFechaISO(d.fechaVencimiento) || null, creadoEn: d.creadoEn.toISOString(),
          }))}
          tiposDocumento={tiposDocumento.map((t) => ({ id: t.id, nombre: t.nombre, requiereVencimiento: t.requiereVencimiento }))}
          semaforo={[]}
          puedeEditar={puedeEditar}
        />
      </div>
    </div>
  )
}
