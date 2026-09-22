import Link from 'next/link'
import { requerirPermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { cn } from '@/lib/utils'
import { historialSolicitudes, filtrarHistorialPara } from '@/server/solicitudes-historial'
import { HistorialSolicitudes } from '@/components/solicitudes/historial-solicitudes'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { BandejaAprobaciones } from './bandeja'
import { defLicencia } from '@/lib/licencias'
import { fechaBreve } from '@/lib/notificaciones/texto'
import { cuandoSolicitud } from '@/lib/solicitudes-texto'
import { urlFoto } from '@/lib/foto'
import { iniciales } from '@/lib/etiquetas'
import { plazoComprobanteDias } from '@/server/comprobante-permiso'

export const metadata = { title: 'Aprobaciones · Smart Gadgets RH' }

export default async function AprobacionesPage({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  const usuario = await requerirPermiso('autoservicio', 'APROBAR')
  const { vista } = await searchParams
  const enHistorial = vista === 'historial'
  // Plazo del comprobante de asistencia (Ajustes → Empresa), para mostrarlo al aprobar un permiso.
  const plazoComprobante = await plazoComprobanteDias()

  // Solicitudes con un paso pendiente que este usuario puede resolver
  const esAdminRrhh = ['Administrador', 'Recursos Humanos', 'Subgerencia'].includes(usuario.rolNombre)

  const solicitudes = await prisma.solicitud.findMany({
    where: {
      estado: 'EN_APROBACION',
      pasos: { some: { estado: 'PENDIENTE' } },
    },
    include: {
      colaborador: { select: { nombres: true, apellidos: true, fotoPath: true, jefeInmediatoId: true, sede: { select: { nombre: true } } } },
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

  // Documentos adjuntos de las solicitudes visibles
  const docs = await prisma.documento.findMany({
    where: { entidadTipo: 'Solicitud', entidadId: { in: visibles.map((s) => s.id) } },
    select: { id: true, entidadId: true, nombre: true, mimeType: true },
  })
  const docsPorSolicitud = new Map<string, { id: string; nombre: string; esImagen: boolean }[]>()
  for (const d of docs) {
    const arr = docsPorSolicitud.get(d.entidadId) ?? []
    arr.push({ id: d.id, nombre: d.nombre, esImagen: d.mimeType.startsWith('image/') })
    docsPorSolicitud.set(d.entidadId, arr)
  }

  // Archivo: lo ya resuelto (aprobado, rechazado, cancelado), lo que el usuario pudo resolver.
  const historial = enHistorial
    ? filtrarHistorialPara(usuario, await historialSolicitudes({ estados: ['APROBADA', 'RECHAZADA', 'CANCELADA'], take: 200 }))
    : []

  return (
    <div className="max-w-5xl">
      <Encabezado volver enLinea titulo="Aprobaciones" />
      {/* Dos vistas: lo pendiente y el archivo de lo ya decidido. */}
      <div className="mb-4 flex gap-1.5">
        {[
          { href: '/autoservicio/aprobaciones', label: `Por aprobar${visibles.length ? ` (${visibles.length})` : ''}`, activa: !enHistorial },
          { href: '/autoservicio/aprobaciones?vista=historial', label: 'Historial', activa: enHistorial },
        ].map((v) => (
          <Link
            key={v.href}
            href={v.href}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
              v.activa ? 'bg-foreground text-background' : 'border bg-card text-muted-foreground hover:bg-accent',
            )}
          >
            {v.label}
          </Link>
        ))}
      </div>
      {enHistorial ? (
        <HistorialSolicitudes items={historial} conColaborador vacio="Todavía no hay solicitudes resueltas." />
      ) : visibles.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No tienes solicitudes pendientes.</CardContent></Card>
      ) : (
        <BandejaAprobaciones
          plazoComprobanteDias={plazoComprobante}
          solicitudes={visibles.map((s) => {
            const pasoActual = s.pasos.find((p) => p.estado === 'PENDIENTE')!
            const datos = s.datos as Record<string, string>
            const calculoVacaciones = s.tipo === 'VACACIONES'
              ? ((s.datos as Record<string, unknown>).calculoVacaciones as {
                  dias: number; saldo: number; anticipadas: boolean; diasAnticipados: number; advertencias: string[]
                } | undefined) ?? null
              : null
            return {
              id: s.id,
              pasoId: pasoActual.id,
              tipo: s.tipo,
              esPasoJefe: pasoActual.usaJefeInmediato,
              colaborador: `${s.colaborador.nombres} ${s.colaborador.apellidos}`,
              colaboradorId: s.colaboradorId,
              iniciales: iniciales(s.colaborador.nombres, s.colaborador.apellidos),
              fotoUrl: urlFoto(s.colaboradorId, s.colaborador.fotoPath, true),
              sede: s.colaborador.sede.nombre,
              creadoEn: fechaBreve(s.creadoEn),
              cuando: cuandoSolicitud(s.tipo, datos, calculoVacaciones?.dias ?? null),
              motivo: datos.motivo?.trim() || null,
              fechaInicio: datos.fechaInicio ?? '',
              fechaFin: datos.fechaFin ?? '',
              documentos: docsPorSolicitud.get(s.id) ?? [],
              // Certificación en su último paso → se emite (generar/subir) en vez de solo aprobar
              esCertFinal: s.tipo === 'CERTIFICACION_LABORAL' && !s.pasos.some((p) => p.estado === 'PENDIENTE' && p.orden > pasoActual.orden),
              // Licencia que concede la ley: se valida el soporte, no se aprueba ni se niega.
              licenciaDerecho: s.tipo === 'LICENCIA' && !!datos.licenciaTipo && defLicencia(datos.licenciaTipo).derecho,
              calculoVacaciones,
              // La solicitud volvió tras una devolución: el colaborador corrigió el soporte.
              soporteCorregido: Boolean((s.datos as Record<string, unknown>).soporteCorregidoEn),
              contrapropuestaRechazada: (() => {
                if (s.tipo !== 'VACACIONES') return null
                const cp = (s.datos as Record<string, unknown>).contrapropuesta as
                  { fechaInicio: string; fechaFin: string; aceptada?: boolean; respuesta?: string | null } | undefined
                return cp?.aceptada === false
                  ? { fechaInicio: cp.fechaInicio, fechaFin: cp.fechaFin, respuesta: cp.respuesta ?? null }
                  : null
              })(),
            }
          })}
        />
      )}
    </div>
  )
}

