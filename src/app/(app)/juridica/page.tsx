import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { JuridicaCliente } from './juridica-cliente'
import { formatFechaISO } from '@/lib/fechas'

export const metadata = { title: 'Jurídica · Smart Gadgets RH' }

export default async function JuridicaPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const usuario = await requerirPermiso('juridica', 'VER')
  const { tab = 'documentos' } = await searchParams
  const puedeCrear = tienePermiso(usuario, 'juridica', 'CREAR')
  const puedeEditar = tienePermiso(usuario, 'juridica', 'EDITAR')

  const [documentos, disciplinarios, denuncias, consultas] = await Promise.all([
    prisma.documentoLegal.findMany({
      orderBy: { creadoEn: 'desc' },
      take: 100,
      include: { versiones: { orderBy: { version: 'desc' } } },
    }),
    prisma.procesoDisciplinario.findMany({ include: { colaborador: { select: { id: true, nombres: true, apellidos: true, fotoPath: true } } }, orderBy: { creadoEn: 'desc' }, take: 100 }),
    prisma.denunciaAcoso.findMany({ orderBy: { creadoEn: 'desc' }, take: 100 }),
    prisma.consultaReclamoDatos.findMany({ orderBy: { fechaRadicacion: 'desc' }, take: 100 }),
  ])

  return (
    <div className="max-w-6xl">
      <Encabezado titulo="Jurídica" descripcion="Repositorio de documentos legales, procesos disciplinarios, línea ética y habeas data." />
      <JuridicaCliente
        tab={tab}
        puedeCrear={puedeCrear}
        puedeEditar={puedeEditar}
        documentos={documentos.map((d) => ({
          id: d.id, categoria: d.categoria, titulo: d.titulo,
          vigenciaFin: d.vigenciaFin ? formatFechaISO(d.vigenciaFin) : null,
          documentoId: d.documentoId,
          versiones: d.versiones.map((ver) => ({
            version: ver.version, vigente: ver.vigente, archivoDocId: ver.archivoDocId,
            cambios: ver.cambios, creadoEn: formatFechaISO(ver.creadoEn),
          })),
        }))}
        disciplinarios={disciplinarios.map((p) => ({
          id: p.id,
          colaborador: `${p.colaborador.nombres} ${p.colaborador.apellidos}`,
          colaboradorId: p.colaborador.id,
          fotoPath: p.colaborador.fotoPath,
          asunto: p.asunto, etapa: p.etapa, cerrado: p.cerrado,
        }))}
        denuncias={denuncias.map((d) => ({ id: d.id, codigo: d.codigo, tipo: d.tipo, asunto: d.asunto, anonima: d.anonima, estado: d.estado, fecha: formatFechaISO(d.creadoEn) }))}
        consultas={consultas.map((c) => ({
          id: c.id, tipo: c.tipo, titular: c.titular, estado: c.estado, descripcion: c.descripcion,
          fechaRadicacion: formatFechaISO(c.fechaRadicacion),
          fechaLimite: c.fechaLimite ? formatFechaISO(c.fechaLimite) : null,
          respuesta: c.respuesta, respondidaEn: c.respondidaEn ? formatFechaISO(c.respondidaEn) : null,
        }))}
      />
    </div>
  )
}
