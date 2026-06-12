'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'
import { parseFechaISO } from '@/lib/fechas'
import { diasHabilesRango } from '@/app/(app)/novedades/acciones'
import { generarCertificacion } from '@/server/certificaciones'
import { notificarUsuario } from '@/server/notificaciones/avisar'
import type { UsuarioSesion } from '@/server/sesion'

const crearSolicitudSchema = z.object({
  tipo: z.enum(['VACACIONES', 'PERMISO', 'CERTIFICACION_LABORAL']),
  // Vacaciones / permiso
  fechaInicio: z.string().optional(),
  fechaFin: z.string().optional(),
  motivo: z.string().optional(),
  // Certificación
  tipoCertificacion: z.enum(['SIMPLE', 'CON_SALARIO', 'CON_FUNCIONES', 'ENTIDAD_FINANCIERA']).optional(),
  dirigidaA: z.string().optional(),
})

async function colaboradorDe(usuario: UsuarioSesion): Promise<string> {
  if (!usuario.colaboradorId) throw new ErrorNegocio('Tu usuario no está vinculado a una ficha de colaborador.')
  return usuario.colaboradorId
}

export const crearSolicitud = accion(
  { modulo: 'autoservicio', accion: 'CREAR', schema: crearSolicitudSchema },
  async (d, usuario) => {
    const colaboradorId = await colaboradorDe(usuario)
    const colab = await prisma.colaborador.findUniqueOrThrow({
      where: { id: colaboradorId },
      select: { jefeInmediatoId: true },
    })

    const solicitud = await dbAuditado.solicitud.create({
      data: { colaboradorId, tipo: d.tipo, datos: d as object, estado: 'EN_APROBACION' },
    })

    // Pasos: jefe inmediato (si existe) → RRHH/Subgerencia
    const pasos: { orden: number; usaJefeInmediato: boolean; rolAprobador: string | null }[] = []
    let orden = 1
    if (colab.jefeInmediatoId) pasos.push({ orden: orden++, usaJefeInmediato: true, rolAprobador: null })
    pasos.push({ orden: orden++, usaJefeInmediato: false, rolAprobador: 'Recursos Humanos' })

    await prisma.pasoAprobacion.createMany({
      data: pasos.map((p) => ({ solicitudId: solicitud.id, orden: p.orden, usaJefeInmediato: p.usaJefeInmediato, rolAprobador: p.rolAprobador })),
    })

    // Avisar a los aprobadores del primer paso
    await avisarAprobadoresDelPaso(solicitud.id, 1)
    revalidatePath('/autoservicio')
    return { id: solicitud.id }
  },
)

async function avisarAprobadoresDelPaso(solicitudId: string, orden: number) {
  const paso = await prisma.pasoAprobacion.findFirst({ where: { solicitudId, orden } })
  if (!paso) return
  const solicitud = await prisma.solicitud.findUniqueOrThrow({
    where: { id: solicitudId },
    include: { colaborador: { select: { nombres: true, apellidos: true, jefeInmediatoId: true } } },
  })
  const titulo = `Solicitud de ${etiquetaTipo(solicitud.tipo)} por aprobar`
  const mensaje = `${solicitud.colaborador.nombres} ${solicitud.colaborador.apellidos} solicita tu aprobación.`

  if (paso.usaJefeInmediato && solicitud.colaborador.jefeInmediatoId) {
    const jefe = await prisma.colaborador.findUnique({
      where: { id: solicitud.colaborador.jefeInmediatoId },
      select: { usuarioId: true },
    })
    if (jefe?.usuarioId) await notificarUsuario(jefe.usuarioId, titulo, mensaje, '/autoservicio/aprobaciones')
  } else if (paso.rolAprobador) {
    const usuarios = await prisma.user.findMany({
      where: { estado: 'ACTIVO', rol: { nombre: { in: [paso.rolAprobador, 'Subgerencia'] } } },
      select: { id: true },
    })
    for (const u of usuarios) await notificarUsuario(u.id, titulo, mensaje, '/autoservicio/aprobaciones')
  }
}

export const resolverPaso = accion(
  {
    modulo: 'autoservicio',
    accion: 'APROBAR',
    schema: z.object({ pasoId: z.uuid(), aprobar: z.boolean(), comentario: z.string().max(500).optional() }),
  },
  async (d, usuario) => {
    const paso = await prisma.pasoAprobacion.findUniqueOrThrow({
      where: { id: d.pasoId },
      include: { solicitud: { include: { colaborador: true, pasos: { orderBy: { orden: 'asc' } } } } },
    })
    if (paso.estado !== 'PENDIENTE') throw new ErrorNegocio('Este paso ya fue resuelto.')

    // Verificar que el usuario puede resolver el paso
    const puede = await usuarioPuedeResolver(usuario, paso)
    if (!puede) throw new ErrorNegocio('No tienes permiso para aprobar este paso.')

    await dbAuditado.pasoAprobacion.update({
      where: { id: d.pasoId },
      data: { estado: d.aprobar ? 'APROBADO' : 'RECHAZADO', decididoPorId: usuario.id, decididoEn: new Date(), comentario: d.comentario },
    })

    if (!d.aprobar) {
      await dbAuditado.solicitud.update({ where: { id: paso.solicitudId }, data: { estado: 'RECHAZADA', resultado: d.comentario ?? 'Rechazada' } })
      await avisarSolicitante(paso.solicitudId, 'Tu solicitud fue rechazada', d.comentario ?? '')
      revalidatePath('/autoservicio')
      revalidatePath('/autoservicio/aprobaciones')
      return { ok: true }
    }

    // ¿Hay un paso siguiente pendiente?
    const siguiente = paso.solicitud.pasos.find((p) => p.orden > paso.orden && p.estado === 'PENDIENTE')
    if (siguiente) {
      await avisarAprobadoresDelPaso(paso.solicitudId, siguiente.orden)
    } else {
      // Último paso → ejecutar efecto
      await ejecutarEfecto(paso.solicitudId, usuario.id)
    }
    revalidatePath('/autoservicio')
    revalidatePath('/autoservicio/aprobaciones')
    return { ok: true }
  },
)

async function usuarioPuedeResolver(usuario: UsuarioSesion, paso: { usaJefeInmediato: boolean; rolAprobador: string | null; solicitud: { colaborador: { jefeInmediatoId: string | null } } }): Promise<boolean> {
  // RRHH/Admin/Subgerencia pueden resolver cualquier paso (pueden saltar el nivel 1)
  if (['Administrador', 'Recursos Humanos', 'Subgerencia'].includes(usuario.rolNombre)) return true
  if (paso.usaJefeInmediato) {
    return usuario.colaboradorId != null && usuario.colaboradorId === paso.solicitud.colaborador.jefeInmediatoId
  }
  return paso.rolAprobador != null && usuario.rolNombre === paso.rolAprobador
}

async function ejecutarEfecto(solicitudId: string, usuarioId: string) {
  const s = await prisma.solicitud.findUniqueOrThrow({ where: { id: solicitudId } })
  const datos = s.datos as Record<string, string>
  let resultado = 'Aprobada'

  if (s.tipo === 'VACACIONES' && datos.fechaInicio && datos.fechaFin) {
    const dias = await diasHabilesRango(datos.fechaInicio, datos.fechaFin)
    await prisma.vacaciones.create({
      data: {
        colaboradorId: s.colaboradorId,
        fechaInicio: parseFechaISO(datos.fechaInicio)!, fechaFin: parseFechaISO(datos.fechaFin)!,
        diasHabiles: dias, estado: 'APROBADA',
      },
    })
    resultado = `Vacaciones aprobadas (${dias} días hábiles)`
  } else if (s.tipo === 'PERMISO' && datos.fechaInicio) {
    await prisma.permiso.create({
      data: { colaboradorId: s.colaboradorId, fecha: parseFechaISO(datos.fechaInicio)!, diaCompleto: true, motivo: datos.motivo ?? 'Permiso', remunerado: true },
    })
    resultado = 'Permiso aprobado'
  } else if (s.tipo === 'CERTIFICACION_LABORAL') {
    const { documentoId } = await generarCertificacion({
      colaboradorId: s.colaboradorId,
      tipo: (datos.tipoCertificacion as 'SIMPLE') ?? 'SIMPLE',
      dirigidaA: datos.dirigidaA ?? null,
      generadoPorId: usuarioId,
    })
    resultado = `Certificación generada:${documentoId}`
  }

  await dbAuditado.solicitud.update({ where: { id: solicitudId }, data: { estado: 'APROBADA', resultado } })
  await avisarSolicitante(solicitudId, 'Tu solicitud fue aprobada', resultado)
}

export const cancelarSolicitud = accion(
  { modulo: 'autoservicio', accion: 'CREAR', schema: z.object({ id: z.uuid() }) },
  async ({ id }, usuario) => {
    const s = await prisma.solicitud.findUniqueOrThrow({ where: { id } })
    if (s.colaboradorId !== usuario.colaboradorId) throw new ErrorNegocio('No puedes cancelar esta solicitud.')
    if (s.estado === 'APROBADA' || s.estado === 'RECHAZADA') throw new ErrorNegocio('La solicitud ya fue resuelta.')
    await dbAuditado.solicitud.update({ where: { id }, data: { estado: 'CANCELADA' } })
    revalidatePath('/autoservicio')
  },
)

async function avisarSolicitante(solicitudId: string, titulo: string, mensaje: string) {
  const s = await prisma.solicitud.findUniqueOrThrow({
    where: { id: solicitudId },
    include: { colaborador: { select: { usuarioId: true } } },
  })
  if (s.colaborador.usuarioId) await notificarUsuario(s.colaborador.usuarioId, titulo, mensaje, '/autoservicio')
}

function etiquetaTipo(tipo: string): string {
  return tipo === 'VACACIONES' ? 'vacaciones' : tipo === 'PERMISO' ? 'permiso' : 'certificación'
}
