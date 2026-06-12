import { requerirPermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { BandejaAprobaciones } from './bandeja'
import { formatFechaISO } from '@/lib/fechas'

export const metadata = { title: 'Aprobaciones · Smart Gadgets RH' }

export default async function AprobacionesPage() {
  const usuario = await requerirPermiso('autoservicio', 'APROBAR')

  // Solicitudes con un paso pendiente que este usuario puede resolver
  const esAdminRrhh = ['Administrador', 'Recursos Humanos', 'Subgerencia'].includes(usuario.rolNombre)

  const solicitudes = await prisma.solicitud.findMany({
    where: {
      estado: 'EN_APROBACION',
      pasos: { some: { estado: 'PENDIENTE' } },
    },
    include: {
      colaborador: { select: { nombres: true, apellidos: true, jefeInmediatoId: true, sede: { select: { nombre: true } } } },
      pasos: { orderBy: { orden: 'asc' } },
    },
    orderBy: { creadoEn: 'asc' },
  })

  // Filtrar a las que el usuario puede resolver (paso pendiente actual)
  const visibles = solicitudes.filter((s) => {
    const pasoActual = s.pasos.find((p) => p.estado === 'PENDIENTE')
    if (!pasoActual) return false
    if (esAdminRrhh) return true
    if (pasoActual.usaJefeInmediato) return usuario.colaboradorId === s.colaborador.jefeInmediatoId
    return pasoActual.rolAprobador === usuario.rolNombre
  })

  return (
    <div className="mx-auto max-w-3xl">
      <Encabezado titulo="Solicitudes por aprobar" descripcion="Aprueba o rechaza las solicitudes de autoservicio de tu equipo." />
      {visibles.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No tienes solicitudes pendientes.</CardContent></Card>
      ) : (
        <BandejaAprobaciones
          solicitudes={visibles.map((s) => {
            const pasoActual = s.pasos.find((p) => p.estado === 'PENDIENTE')!
            const datos = s.datos as Record<string, string>
            return {
              id: s.id,
              pasoId: pasoActual.id,
              tipo: s.tipo,
              colaborador: `${s.colaborador.nombres} ${s.colaborador.apellidos}`,
              sede: s.colaborador.sede.nombre,
              creadoEn: formatFechaISO(s.creadoEn),
              detalle: detalleSolicitud(s.tipo, datos),
            }
          })}
        />
      )}
    </div>
  )
}

function detalleSolicitud(tipo: string, datos: Record<string, string>): string {
  if (tipo === 'VACACIONES') return `Del ${datos.fechaInicio} al ${datos.fechaFin}`
  if (tipo === 'PERMISO') return `${datos.fechaInicio} · ${datos.motivo ?? ''}`
  if (tipo === 'CERTIFICACION_LABORAL') return `${datos.tipoCertificacion ?? 'Simple'}${datos.dirigidaA ? ` · para ${datos.dirigidaA}` : ''}`
  return ''
}
