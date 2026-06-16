'use server'

import { revalidatePath } from 'next/cache'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'
import { parseFechaISO, hoyBogota } from '@/lib/fechas'
import { publicarVencimiento } from '@/server/vencimientos/servicio'
import { avisar, avisarPorRol, usuarioDeColaborador } from '@/server/notificaciones/avisar'

const v = (s: string | undefined | null) => (s && s !== '' ? s : null)

const DOC_ORIGEN: Record<string, 'POLIZA' | 'ARRIENDO' | 'CONVENIO_FINANCIERA' | 'MARCA' | 'DOMINIO_WEB' | 'LICENCIA_SOFTWARE'> = {
  POLIZA: 'POLIZA', ARRIENDO: 'ARRIENDO', CONVENIO_FINANCIERA: 'CONVENIO_FINANCIERA',
  MARCA: 'MARCA', DOMINIO_WEB: 'DOMINIO_WEB', LICENCIA_SOFTWARE: 'LICENCIA_SOFTWARE',
}

export const crearDocumentoLegal = accion(
  {
    modulo: 'juridica',
    accion: 'CREAR',
    schema: z.object({
      categoria: z.enum(['REGLAMENTO_INTERNO', 'POLITICA', 'CONVENIO_FINANCIERA', 'POLIZA', 'ARRIENDO', 'MARCA', 'DOMINIO_WEB', 'LICENCIA_SOFTWARE', 'ACUERDO_TRANSMISION_DATOS', 'PERMISO_ESTABLECIMIENTO', 'OTRO']),
      titulo: z.string().trim().min(2).max(200),
      descripcion: z.string().max(1000).optional(),
      vigenciaFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
    }),
  },
  async (d) => {
    const doc = await dbAuditado.documentoLegal.create({
      data: { categoria: d.categoria, titulo: d.titulo, descripcion: v(d.descripcion), vigenciaFin: parseFechaISO(d.vigenciaFin || null) },
    })
    // Si tiene vigencia y es de los tipos con vencimiento, publica un Vencimiento
    if (doc.vigenciaFin && DOC_ORIGEN[d.categoria]) {
      await publicarVencimiento({
        origen: DOC_ORIGEN[d.categoria],
        entidadTipo: 'DocumentoLegal',
        entidadId: doc.id,
        titulo: `Vence: ${doc.titulo}`,
        fechaVencimientoISO: d.vigenciaFin as string,
        responsables: [{ rol: 'Jurídica' }],
      })
    }
    revalidatePath('/juridica')
  },
)

export const crearProcesoDisciplinario = accion(
  {
    modulo: 'juridica',
    accion: 'CREAR',
    schema: z.object({ colaboradorId: z.uuid(), asunto: z.string().trim().min(3).max(200), descripcion: z.string().max(1000).optional(), fechaApertura: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  },
  async (d) => {
    const colab = await prisma.colaborador.findUniqueOrThrow({ where: { id: d.colaboradorId }, select: { nombres: true } })
    const p = await dbAuditado.procesoDisciplinario.create({
      data: { colaboradorId: d.colaboradorId, asunto: d.asunto, descripcion: v(d.descripcion), fechaApertura: parseFechaISO(d.fechaApertura)!, etapa: 'CITACION_DESCARGOS' },
    })
    // Citación a descargos: avisar al colaborador (app + correo) para que entre y presente descargos
    const userId = await usuarioDeColaborador(d.colaboradorId)
    if (userId) {
      await avisar(userId, {
        titulo: 'Citación a descargos — proceso disciplinario',
        mensaje: `${colab.nombres}, se abrió un proceso disciplinario por: "${d.asunto}". Tienes derecho a presentar tus descargos. Ingresa a la plataforma para hacerlo en la sección de Autoservicio.`,
        enlace: '/autoservicio/disciplinarios',
        llamadoAccion: 'Presentar mis descargos',
      })
    }
    revalidatePath('/juridica')
    return { id: p.id }
  },
)

/** El colaborador (empleado) presenta sus propios descargos en el proceso disciplinario. */
export const presentarDescargos = accion(
  { modulo: 'autoservicio', accion: 'CREAR', schema: z.object({ procesoId: z.uuid(), texto: z.string().trim().min(5).max(4000) }) },
  async (d, usuario) => {
    const proceso = await prisma.procesoDisciplinario.findUniqueOrThrow({ where: { id: d.procesoId }, include: { colaborador: { select: { usuarioId: true, nombres: true, apellidos: true } } } })
    if (proceso.colaborador.usuarioId !== usuario.id) throw new ErrorNegocio('Solo el colaborador citado puede presentar sus descargos.')
    if (proceso.cerrado) throw new ErrorNegocio('El proceso ya está cerrado.')

    await dbAuditado.etapaProceso.create({
      data: { procesoId: d.procesoId, etapa: 'DESCARGOS', fecha: hoyBogota(), detalle: `Descargos del colaborador: ${d.texto}` },
    })
    await dbAuditado.procesoDisciplinario.update({ where: { id: d.procesoId }, data: { etapa: 'DESCARGOS' } })

    // Avisar a Jurídica/RRHH que el colaborador presentó descargos
    await avisarPorRol(['Jurídica', 'Recursos Humanos', 'Administrador'], {
      titulo: 'Descargos presentados',
      mensaje: `${proceso.colaborador.nombres} ${proceso.colaborador.apellidos} presentó sus descargos en el proceso "${proceso.asunto}".`,
      enlace: `/juridica/disciplinarios/${d.procesoId}`,
      llamadoAccion: 'Revisar los descargos',
    })
    revalidatePath('/autoservicio/disciplinarios')
    revalidatePath(`/juridica/disciplinarios/${d.procesoId}`)
    return { ok: true }
  },
)

export const avanzarEtapaDisciplinario = accion(
  {
    modulo: 'juridica',
    accion: 'EDITAR',
    schema: z.object({ procesoId: z.uuid(), etapa: z.enum(['CITACION_DESCARGOS', 'DESCARGOS', 'DECISION', 'RECURSO', 'CERRADO']), fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), detalle: z.string().max(1000).optional() }),
  },
  async (d) => {
    const proceso = await prisma.procesoDisciplinario.findUniqueOrThrow({ where: { id: d.procesoId }, include: { etapas: true, colaborador: { select: { usuarioId: true } } } })
    // Debido proceso: no se puede decidir sin descargos previos
    if (d.etapa === 'DECISION' && !proceso.etapas.some((e) => e.etapa === 'DESCARGOS')) {
      throw new ErrorNegocio('No se puede registrar la decisión sin que consten los descargos (debido proceso).')
    }
    await dbAuditado.etapaProceso.create({ data: { procesoId: d.procesoId, etapa: d.etapa, fecha: parseFechaISO(d.fecha)!, detalle: v(d.detalle) } })
    await dbAuditado.procesoDisciplinario.update({ where: { id: d.procesoId }, data: { etapa: d.etapa, cerrado: d.etapa === 'CERRADO' } })

    // Avisar al colaborador de la nueva actuación (decisión, recurso o cierre)
    const ETAPA_TXT: Record<string, string> = { CITACION_DESCARGOS: 'Citación a descargos', DESCARGOS: 'Descargos', DECISION: 'Decisión', RECURSO: 'Recurso', CERRADO: 'Cierre del proceso' }
    if (proceso.colaborador.usuarioId && d.etapa !== 'DESCARGOS') {
      await avisar(proceso.colaborador.usuarioId, {
        titulo: `Proceso disciplinario: ${ETAPA_TXT[d.etapa]}`,
        mensaje: `Hay una nueva actuación en el proceso "${proceso.asunto}": ${ETAPA_TXT[d.etapa]}.${d.detalle ? ` ${d.detalle}` : ''}`,
        enlace: '/autoservicio/disciplinarios',
        llamadoAccion: 'Ver el proceso',
      })
    }
    revalidatePath(`/juridica/disciplinarios/${d.procesoId}`)
  },
)

export const crearDenuncia = accion(
  {
    modulo: 'juridica',
    accion: 'CREAR',
    schema: z.object({ anonima: z.boolean(), denuncianteNombre: z.string().max(150).optional(), hechos: z.string().trim().min(10).max(2000), fechaHechos: z.string().optional() }),
  },
  async (d) => {
    const codigo = `DA-${randomBytes(4).toString('hex').toUpperCase()}`
    await dbAuditado.denunciaAcoso.create({
      data: { codigo, anonima: d.anonima, denuncianteNombre: d.anonima ? null : v(d.denuncianteNombre), hechos: d.hechos, fechaHechos: parseFechaISO(d.fechaHechos || null), estado: 'RECIBIDA' },
    })
    revalidatePath('/juridica')
    return { codigo }
  },
)

export const actualizarDenuncia = accion(
  { modulo: 'juridica', accion: 'EDITAR', schema: z.object({ id: z.uuid(), estado: z.enum(['RECIBIDA', 'EN_INVESTIGACION', 'RESUELTA', 'ARCHIVADA']), resolucion: z.string().max(1000).optional() }) },
  async (d) => {
    await dbAuditado.denunciaAcoso.update({ where: { id: d.id }, data: { estado: d.estado, resolucion: v(d.resolucion) } })
    revalidatePath('/juridica')
  },
)

export const registrarAutorizacionDatos = accion(
  { modulo: 'juridica', accion: 'CREAR', schema: z.object({ colaboradorId: z.uuid(), finalidad: z.string().trim().min(3).max(500), fechaAutorizacion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }) },
  async (d) => {
    await dbAuditado.autorizacionDatos.create({ data: { colaboradorId: d.colaboradorId, finalidad: d.finalidad, fechaAutorizacion: parseFechaISO(d.fechaAutorizacion)! } })
    revalidatePath('/juridica')
  },
)

export const crearConsultaReclamo = accion(
  {
    modulo: 'juridica',
    accion: 'CREAR',
    schema: z.object({ tipo: z.enum(['CONSULTA', 'RECLAMO']), titular: z.string().trim().min(2).max(150), descripcion: z.string().trim().min(5).max(1000), fechaRadicacion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  },
  async (d) => {
    // Plazo legal: consulta 10 días hábiles, reclamo 15 días hábiles (Ley 1581)
    const fechaRad = parseFechaISO(d.fechaRadicacion)!
    const fechaLimite = new Date(fechaRad)
    fechaLimite.setUTCDate(fechaLimite.getUTCDate() + (d.tipo === 'CONSULTA' ? 14 : 21))
    await dbAuditado.consultaReclamoDatos.create({
      data: { tipo: d.tipo, titular: d.titular, descripcion: d.descripcion, fechaRadicacion: fechaRad, fechaLimite, estado: 'ABIERTO' },
    })
    revalidatePath('/juridica')
  },
)
