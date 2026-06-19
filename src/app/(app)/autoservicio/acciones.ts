'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'
import { parseFechaISO } from '@/lib/fechas'
import { diasHabilesRango } from '@/app/(app)/novedades/acciones'
import { generarCertificacion } from '@/server/certificaciones'
import { avisar } from '@/server/notificaciones/avisar'
import type { UsuarioSesion } from '@/server/sesion'

const crearSolicitudSchema = z.object({
  tipo: z.enum(['VACACIONES', 'PERMISO', 'INCAPACIDAD', 'CERTIFICACION_LABORAL']),
  // Vacaciones (rango) · Permiso (un solo día en fechaInicio) · Incapacidad (rango)
  fechaInicio: z.string().optional(),
  fechaFin: z.string().optional(),
  motivo: z.string().optional(),
  // Permiso: día completo u horas (desde-hasta)
  permisoTipo: z.enum(['DIA', 'HORAS']).optional(),
  horaInicio: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  horaFin: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  // Incapacidad
  incapacidadTipo: z.enum(['ENFERMEDAD_GENERAL', 'ACCIDENTE_TRABAJO', 'ENFERMEDAD_LABORAL', 'LICENCIA_MATERNIDAD', 'LICENCIA_PATERNIDAD']).optional(),
  entidad: z.string().optional(),
  // Certificación
  tipoCertificacion: z.enum(['SIMPLE', 'CON_SALARIO', 'CON_FUNCIONES', 'ENTIDAD_FINANCIERA']).optional(),
  dirigidaA: z.string().optional(),
})

/** Horas decimales entre dos "HH:MM" (mismo día). */
function horasEntre(ini: string, fin: string): number {
  const [hi, mi] = ini.split(':').map(Number)
  const [hf, mf] = fin.split(':').map(Number)
  return Math.max(0, Math.round(((hf * 60 + mf - (hi * 60 + mi)) / 60) * 10) / 10)
}

/** Días calendario inclusivos entre dos fechas ISO (yyyy-mm-dd). */
function diasCalendario(ini: string, fin: string): number {
  const a = Date.parse(`${ini}T00:00:00Z`)
  const b = Date.parse(`${fin}T00:00:00Z`)
  return Math.max(1, Math.floor((b - a) / 86_400_000) + 1)
}

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
      select: { jefeInmediatoId: true, jefeInmediato: { select: { usuario: { select: { rol: { select: { nombre: true } } } } } } },
    })

    const solicitud = await dbAuditado.solicitud.create({
      data: { colaboradorId, tipo: d.tipo, datos: d as object, estado: 'EN_APROBACION' },
    })

    // Pasos de aprobación según el tipo:
    //  - Incapacidad: la valida y registra Talento Humano (no se "aprueba" al jefe);
    //    el jefe solo recibe aviso informativo.
    //  - Resto: jefe inmediato (nivel área, si existe) → Talento Humano (nivel empresa).
    // Si el jefe inmediato YA tiene autoridad de empresa (Talento Humano/Gerencia/Admin),
    // su única aprobación cubre ambos niveles y no se agrega un paso de Talento Humano aparte
    // (p. ej. Andrés cuyo jefe inmediato es Laura, administradora/Talento Humano).
    const ROLES_EMPRESA = ['Administrador', 'Recursos Humanos', 'Subgerencia']
    const jefeEsEmpresa = !!colab.jefeInmediato?.usuario?.rol && ROLES_EMPRESA.includes(colab.jefeInmediato.usuario.rol.nombre)
    const tieneJefeStep = d.tipo !== 'INCAPACIDAD' && !!colab.jefeInmediatoId

    const pasos: { orden: number; usaJefeInmediato: boolean; rolAprobador: string | null }[] = []
    let orden = 1
    if (tieneJefeStep) pasos.push({ orden: orden++, usaJefeInmediato: true, rolAprobador: null })
    if (!(tieneJefeStep && jefeEsEmpresa)) {
      pasos.push({ orden: orden++, usaJefeInmediato: false, rolAprobador: 'Recursos Humanos' })
    }

    await prisma.pasoAprobacion.createMany({
      data: pasos.map((p) => ({ solicitudId: solicitud.id, orden: p.orden, usaJefeInmediato: p.usaJefeInmediato, rolAprobador: p.rolAprobador })),
    })

    // Avisar a los aprobadores del primer paso
    await avisarAprobadoresDelPaso(solicitud.id, 1)

    // Incapacidad: avisar también al jefe inmediato (informativo)
    if (d.tipo === 'INCAPACIDAD' && colab.jefeInmediatoId) {
      const jefe = await prisma.colaborador.findUnique({ where: { id: colab.jefeInmediatoId }, select: { usuarioId: true } })
      const yo = await prisma.colaborador.findUnique({ where: { id: colaboradorId }, select: { nombres: true, apellidos: true } })
      if (jefe?.usuarioId) {
        await avisar(jefe.usuarioId, {
          titulo: 'Tu colaborador reportó una incapacidad',
          mensaje: `${yo?.nombres ?? ''} ${yo?.apellidos ?? ''} reportó una incapacidad. Talento Humano la validará y registrará.`,
          enlace: '/autoservicio/aprobaciones',
        })
      }
    }
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
  const mensaje = `${solicitud.colaborador.nombres} ${solicitud.colaborador.apellidos} solicita tu aprobación. Entra a la plataforma para revisarla y decidir.`
  const opts = { titulo, mensaje, enlace: '/autoservicio/aprobaciones', llamadoAccion: 'Revisar la solicitud' }

  if (paso.usaJefeInmediato && solicitud.colaborador.jefeInmediatoId) {
    const jefe = await prisma.colaborador.findUnique({
      where: { id: solicitud.colaborador.jefeInmediatoId },
      select: { usuarioId: true },
    })
    if (jefe?.usuarioId) await avisar(jefe.usuarioId, opts)
  } else if (paso.rolAprobador) {
    // Talento Humano: RRHH + Subgerencia + Administrador (la coordinadora de TH es administradora)
    const usuarios = await prisma.user.findMany({
      where: { estado: 'ACTIVO', rol: { nombre: { in: [paso.rolAprobador, 'Subgerencia', 'Administrador'] } } },
      select: { id: true },
    })
    for (const u of usuarios) await avisar(u.id, opts)
  }
}

export const resolverPaso = accion(
  {
    modulo: 'autoservicio',
    accion: 'APROBAR',
    schema: z.object({
      pasoId: z.uuid(),
      aprobar: z.boolean(),
      comentario: z.string().max(500).optional(),
      // El jefe puede aprobar proponiendo otras fechas
      nuevaFechaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
      nuevaFechaFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
    }),
  },
  async (d, usuario) => {
    const paso = await prisma.pasoAprobacion.findUniqueOrThrow({
      where: { id: d.pasoId },
      include: { solicitud: { include: { colaborador: true, pasos: { orderBy: { orden: 'asc' } } } } },
    })
    if (paso.estado !== 'PENDIENTE') throw new ErrorNegocio('Este paso ya fue resuelto.')

    const puede = await usuarioPuedeResolver(usuario, paso)
    if (!puede) throw new ErrorNegocio('No tienes permiso para aprobar este paso.')

    // Si propone otras fechas, actualizar la solicitud y avisar al solicitante del cambio
    let notaCambioFechas = ''
    if (d.aprobar && (d.nuevaFechaInicio || d.nuevaFechaFin)) {
      const datos = { ...(paso.solicitud.datos as Record<string, string>) }
      if (d.nuevaFechaInicio) datos.fechaInicio = d.nuevaFechaInicio
      if (d.nuevaFechaFin) datos.fechaFin = d.nuevaFechaFin
      await dbAuditado.solicitud.update({ where: { id: paso.solicitudId }, data: { datos } })
      notaCambioFechas = ` Tu jefe propuso nuevas fechas: ${datos.fechaInicio ?? ''}${datos.fechaFin ? ` a ${datos.fechaFin}` : ''}.`
      await avisarSolicitante(paso.solicitudId, 'Tu solicitud fue aprobada con cambio de fechas', `${d.comentario ?? ''}${notaCambioFechas}`)
    }

    await dbAuditado.pasoAprobacion.update({
      where: { id: d.pasoId },
      data: {
        estado: d.aprobar ? 'APROBADO' : 'RECHAZADO', decididoPorId: usuario.id, decididoEn: new Date(),
        comentario: [d.comentario, notaCambioFechas].filter(Boolean).join(' ').trim() || null,
      },
    })

    if (!d.aprobar) {
      await dbAuditado.solicitud.update({ where: { id: paso.solicitudId }, data: { estado: 'RECHAZADA', resultado: d.comentario ?? 'Rechazada' } })
      await avisarSolicitante(paso.solicitudId, 'Tu solicitud fue rechazada', d.comentario ?? 'Tu jefe inmediato rechazó la solicitud.')
      revalidatePath('/autoservicio')
      revalidatePath('/autoservicio/aprobaciones')
      return { ok: true }
    }

    const siguiente = paso.solicitud.pasos.find((p) => p.orden > paso.orden && p.estado === 'PENDIENTE')
    if (siguiente) {
      await avisarAprobadoresDelPaso(paso.solicitudId, siguiente.orden)
    } else {
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
        diasHabiles: dias, estado: 'APROBADA', solicitudId,
      },
    })
    resultado = `Vacaciones aprobadas (${dias} días hábiles)`
  } else if (s.tipo === 'PERMISO' && datos.fechaInicio) {
    const porHoras = datos.permisoTipo === 'HORAS' && !!datos.horaInicio && !!datos.horaFin
    await prisma.permiso.create({
      data: {
        colaboradorId: s.colaboradorId, fecha: parseFechaISO(datos.fechaInicio)!,
        diaCompleto: !porHoras,
        horaInicio: porHoras ? datos.horaInicio : null,
        horaFin: porHoras ? datos.horaFin : null,
        horas: porHoras ? horasEntre(datos.horaInicio!, datos.horaFin!) : null,
        motivo: datos.motivo ?? 'Permiso', remunerado: true, solicitudId,
      },
    })
    resultado = porHoras ? `Permiso aprobado (${datos.horaInicio}–${datos.horaFin})` : 'Permiso aprobado (día completo)'
  } else if (s.tipo === 'INCAPACIDAD' && datos.fechaInicio && datos.fechaFin) {
    const dias = diasCalendario(datos.fechaInicio, datos.fechaFin)
    await prisma.incapacidad.create({
      data: {
        colaboradorId: s.colaboradorId,
        tipo: (datos.incapacidadTipo as 'ENFERMEDAD_GENERAL') ?? 'ENFERMEDAD_GENERAL',
        fechaInicio: parseFechaISO(datos.fechaInicio)!, fechaFin: parseFechaISO(datos.fechaFin)!,
        dias, entidad: datos.entidad || null, observaciones: datos.motivo || null, solicitudId,
      },
    })
    resultado = `Incapacidad registrada (${dias} día(s))`
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
  if (s.colaborador.usuarioId) await avisar(s.colaborador.usuarioId, { titulo, mensaje, enlace: '/autoservicio', llamadoAccion: 'Ver mi solicitud' })
}

function etiquetaTipo(tipo: string): string {
  return tipo === 'VACACIONES' ? 'vacaciones' : tipo === 'PERMISO' ? 'permiso' : tipo === 'INCAPACIDAD' ? 'incapacidad' : 'certificación'
}
