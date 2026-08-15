import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { sedeActualId } from '@/server/sede-actual'
import { Encabezado } from '@/components/shell/encabezado'
import { ActivosCliente } from './activos-cliente'
import { formatFechaISO } from '@/lib/fechas'

export const metadata = { title: 'Activos y dotación · Smart Gadgets RH' }

export default async function ActivosPage() {
  const usuario = await requerirPermiso('activos', 'VER')
  const puedeCrear = tienePermiso(usuario, 'activos', 'CREAR')
  const puedeEditar = tienePermiso(usuario, 'activos', 'EDITAR')
  const sede = await sedeActualId()

  const [activos, dotaciones, sedes] = await Promise.all([
    prisma.activo.findMany({
      where: sede ? { sedeId: sede } : {},
      include: { asignaciones: { where: { fechaDevolucion: null }, include: { colaborador: { select: { nombres: true, apellidos: true } } }, take: 1 } },
      orderBy: { creadoEn: 'desc' },
      take: 200,
    }),
    prisma.entregaDotacion.findMany({
      include: { colaborador: { select: { nombres: true, apellidos: true } } },
      orderBy: { fechaEntrega: 'desc' },
      take: 100,
    }),
    prisma.sede.findMany({ where: { activa: true }, include: { ciudad: true }, orderBy: { nombre: 'asc' } }),
  ])

  return (
    <div className="max-w-7xl">
      <Encabezado titulo="Activos y dotación" descripcion="Inventario de activos con actas de entrega/devolución y dotación legal (3 entregas al año)." />
      <ActivosCliente
        puedeCrear={puedeCrear}
        puedeEditar={puedeEditar}
        sedes={sedes.map((s) => ({ id: s.id, nombre: s.nombre, ciudad: s.ciudad.nombre }))}
        activos={activos.map((a) => ({
          id: a.id, codigo: a.codigo, nombre: a.nombre, tipo: a.tipo, estado: a.estado,
          valor: a.valor ? Number(a.valor) : null,
          asignacion: a.asignaciones[0] ? { id: a.asignaciones[0].id, colaborador: `${a.asignaciones[0].colaborador.nombres} ${a.asignaciones[0].colaborador.apellidos}`, actaEntregaDocId: a.asignaciones[0].actaEntregaDocId, actaFirmada: Boolean(a.asignaciones[0].firmaEntregaEn) } : null,
        }))}
        dotaciones={dotaciones.map((d) => ({
          id: d.id,
          colaborador: `${d.colaborador.nombres} ${d.colaborador.apellidos}`,
          anio: d.anio, corte: d.corte, items: d.items,
          fechaEntrega: formatFechaISO(d.fechaEntrega),
          recibidoDocId: d.recibidoDocId,
          firmado: Boolean(d.firmadoEn),
        }))}
      />
    </div>
  )
}
