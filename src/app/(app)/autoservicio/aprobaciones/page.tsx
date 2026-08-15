import { requerirPermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { BandejaAprobaciones } from './bandeja'
import { formatFechaISO } from '@/lib/fechas'
import { defLicencia } from '@/lib/licencias'

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

  return (
    <div className="max-w-5xl">
      <Encabezado titulo="Solicitudes por aprobar" descripcion="Aprueba o rechaza las solicitudes de autoservicio de tu equipo." />
      {visibles.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No tienes solicitudes pendientes.</CardContent></Card>
      ) : (
        <BandejaAprobaciones
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
              sede: s.colaborador.sede.nombre,
              creadoEn: formatFechaISO(s.creadoEn),
              detalle: detalleSolicitud(s.tipo, datos),
              fechaInicio: datos.fechaInicio ?? '',
              fechaFin: datos.fechaFin ?? '',
              documentos: docsPorSolicitud.get(s.id) ?? [],
              // Certificación en su último paso → se emite (generar/subir) en vez de solo aprobar
              esCertFinal: s.tipo === 'CERTIFICACION_LABORAL' && !s.pasos.some((p) => p.estado === 'PENDIENTE' && p.orden > pasoActual.orden),
              // Licencia que concede la ley: se valida el soporte, no se aprueba ni se niega.
              licenciaDerecho: s.tipo === 'LICENCIA' && !!datos.licenciaTipo && defLicencia(datos.licenciaTipo).derecho,
              licenciaFundamento: s.tipo === 'LICENCIA' && datos.licenciaTipo ? defLicencia(datos.licenciaTipo).fundamento : null,
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

const TIPO_INCAP: Record<string, string> = {
  ENFERMEDAD_GENERAL: 'Enfermedad general', ACCIDENTE_TRABAJO: 'Accidente de trabajo',
  ENFERMEDAD_LABORAL: 'Enfermedad laboral', LICENCIA_MATERNIDAD: 'Lic. maternidad', LICENCIA_PATERNIDAD: 'Lic. paternidad',
}

function detalleSolicitud(tipo: string, datos: Record<string, string>): string {
  if (tipo === 'VACACIONES') return `Del ${datos.fechaInicio} al ${datos.fechaFin}`
  if (tipo === 'PERMISO') {
    const cuando = datos.permisoTipo === 'HORAS' && datos.horaInicio ? `${datos.fechaInicio} · ${datos.horaInicio}–${datos.horaFin}` : `${datos.fechaInicio} · día completo`
    return `${cuando}${datos.motivo ? ` · ${datos.motivo}` : ''}`
  }
  if (tipo === 'INCAPACIDAD') return `${TIPO_INCAP[datos.incapacidadTipo] ?? 'Incapacidad'} · del ${datos.fechaInicio} al ${datos.fechaFin}${datos.entidad ? ` · ${datos.entidad}` : ''}`
  if (tipo === 'CERTIFICACION_LABORAL') return `${datos.tipoCertificacion ?? 'Simple'}${datos.dirigidaA ? ` · para ${datos.dirigidaA}` : ''}`
  if (tipo === 'LICENCIA' && datos.licenciaTipo) {
    const def = defLicencia(datos.licenciaTipo)
    return `${def.label} · del ${datos.fechaInicio} al ${datos.fechaFin} · ${def.remunerada ? 'remunerada' : 'no remunerada'}${datos.motivo ? ` · ${datos.motivo}` : ''}`
  }
  return ''
}
