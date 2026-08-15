import { requerirPermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { formatFechaCorta } from '@/lib/fechas'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { MiDotacion } from './mi-dotacion'

export const metadata = { title: 'Mis entregas · Smart Gadgets RH' }

export default async function MiDotacionPage() {
  const usuario = await requerirPermiso('autoservicio', 'VER')

  if (!usuario.colaboradorId) {
    return (
      <div className="max-w-5xl">
        <Encabezado titulo="Mis entregas" descripcion="" />
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          Tu usuario no está vinculado a una ficha de colaborador.
        </CardContent></Card>
      </div>
    )
  }

  const [entregas, asignaciones, epps] = await Promise.all([
    prisma.entregaDotacion.findMany({
      where: { colaboradorId: usuario.colaboradorId },
      orderBy: [{ anio: 'desc' }, { fechaEntrega: 'desc' }],
    }),
    prisma.asignacionActivo.findMany({
      where: { colaboradorId: usuario.colaboradorId },
      include: { activo: true },
      orderBy: [{ fechaDevolucion: 'asc' }, { fechaEntrega: 'desc' }],
    }),
    prisma.entregaEpp.findMany({
      where: { colaboradorId: usuario.colaboradorId },
      include: { elementoEpp: true },
      orderBy: { fechaEntrega: 'desc' },
    }),
  ])

  return (
    <div className="max-w-5xl">
      <Encabezado
        titulo="Mis entregas"
        descripcion="Todo lo que la empresa te ha entregado — activos a tu cargo, dotación de labor y elementos de protección — con su constancia firmada."
      />
      <MiDotacion
        entregas={entregas.map((e) => ({
          id: e.id,
          anio: e.anio,
          corte: e.corte,
          items: e.items,
          fechaEntrega: formatFechaCorta(e.fechaEntrega),
          firmadoEn: e.firmadoEn ? formatFechaCorta(e.firmadoEn) : null,
          recibidoDocId: e.recibidoDocId,
        }))}
        activos={asignaciones.map((a) => ({
          id: a.id,
          nombre: a.activo.nombre,
          codigo: a.activo.codigo,
          tipo: a.activo.tipo,
          marca: a.activo.marca,
          serie: a.activo.serie,
          fechaEntrega: formatFechaCorta(a.fechaEntrega),
          fechaDevolucion: a.fechaDevolucion ? formatFechaCorta(a.fechaDevolucion) : null,
          actaEntregaDocId: a.actaEntregaDocId,
          actaDevolucionDocId: a.actaDevolucionDocId,
          firmaEntregaEn: a.firmaEntregaEn ? formatFechaCorta(a.firmaEntregaEn) : null,
        }))}
        epps={epps.map((e) => ({
          id: e.id,
          elemento: e.elementoEpp.nombre,
          cantidad: e.cantidad,
          reposicion: e.reposicion,
          fechaEntrega: formatFechaCorta(e.fechaEntrega),
          firmadoEn: e.firmadoEn ? formatFechaCorta(e.firmadoEn) : null,
          soporteDocId: e.soporteDocId,
        }))}
      />
    </div>
  )
}
