'use server'

import { revalidatePath } from 'next/cache'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'
import { parseFechaISO, hoyBogota } from '@/lib/fechas'
import { publicarVencimiento } from '@/server/vencimientos/servicio'

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
    const p = await dbAuditado.procesoDisciplinario.create({
      data: { colaboradorId: d.colaboradorId, asunto: d.asunto, descripcion: v(d.descripcion), fechaApertura: parseFechaISO(d.fechaApertura)!, etapa: 'CITACION_DESCARGOS' },
    })
    revalidatePath('/juridica')
    return { id: p.id }
  },
)

export const avanzarEtapaDisciplinario = accion(
  {
    modulo: 'juridica',
    accion: 'EDITAR',
    schema: z.object({ procesoId: z.uuid(), etapa: z.enum(['CITACION_DESCARGOS', 'DESCARGOS', 'DECISION', 'RECURSO', 'CERRADO']), fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), detalle: z.string().max(1000).optional() }),
  },
  async (d) => {
    const proceso = await prisma.procesoDisciplinario.findUniqueOrThrow({ where: { id: d.procesoId }, include: { etapas: true } })
    // Debido proceso: no se puede decidir sin descargos previos
    if (d.etapa === 'DECISION' && !proceso.etapas.some((e) => e.etapa === 'DESCARGOS')) {
      throw new ErrorNegocio('No se puede registrar la decisión sin que consten los descargos (debido proceso).')
    }
    await dbAuditado.etapaProceso.create({ data: { procesoId: d.procesoId, etapa: d.etapa, fecha: parseFechaISO(d.fecha)!, detalle: v(d.detalle) } })
    await dbAuditado.procesoDisciplinario.update({ where: { id: d.procesoId }, data: { etapa: d.etapa, cerrado: d.etapa === 'CERRADO' } })
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
