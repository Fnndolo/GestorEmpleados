'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'
import { parseFechaISO, hoyBogota } from '@/lib/fechas'
import { subirArchivo } from '@/server/storage'
import { renderActaActivo } from '@/server/pdf/acta-activo'
import { generarRecibidoDotacion } from '@/server/dotacion'
import { avisar, avisarPorRol, usuarioDeColaborador } from '@/server/notificaciones/avisar'

const v = (s: string | undefined | null) => (s && s !== '' ? s : null)

export const crearActivo = accion(
  {
    modulo: 'activos',
    accion: 'CREAR',
    schema: z.object({
      codigo: z.string().trim().min(1).max(40),
      nombre: z.string().trim().min(2).max(120),
      tipo: z.string().trim().min(2).max(60),
      marca: z.string().trim().max(60).optional(),
      serie: z.string().trim().max(60).optional(),
      valor: z.coerce.number().min(0).optional(),
      sedeId: z.union([z.uuid(), z.literal('')]).optional(),
    }),
  },
  async (d) => {
    const dup = await prisma.activo.findUnique({ where: { codigo: d.codigo } })
    if (dup) throw new ErrorNegocio('Ya existe un activo con ese código.')
    await dbAuditado.activo.create({
      data: { codigo: d.codigo, nombre: d.nombre, tipo: d.tipo, marca: v(d.marca), serie: v(d.serie), valor: d.valor ?? null, sedeId: v(d.sedeId), estado: 'DISPONIBLE' },
    })
    revalidatePath('/activos')
  },
)

async function generarActa(
  tipo: 'entrega' | 'devolucion',
  activoId: string,
  colaboradorId: string,
  usuarioId: string,
  firma?: { dataUri: string; fecha: Date },
): Promise<string> {
  const activo = await prisma.activo.findUniqueOrThrow({ where: { id: activoId } })
  const colab = await prisma.colaborador.findUniqueOrThrow({ where: { id: colaboradorId }, include: { cargo: true, sede: { include: { ciudad: true } } } })
  const empresa = await prisma.configuracionEmpresa.findFirstOrThrow()
  const pdf = await renderActaActivo({
    tipo,
    empresa: { razonSocial: empresa.razonSocial, nombreComercial: empresa.nombreComercial, nit: empresa.nit, direccion: empresa.direccion, telefono: empresa.telefono, emailContacto: empresa.emailContacto },
    colaborador: { nombre: `${colab.nombres} ${colab.apellidos}`, documento: colab.numeroDocumento, cargo: colab.cargo?.nombre ?? null },
    activo: { codigo: activo.codigo, nombre: activo.nombre, tipo: activo.tipo, marca: activo.marca, serie: activo.serie, valor: activo.valor ? Number(activo.valor) : null },
    ciudad: colab.sede.ciudad.nombre,
    fecha: hoyBogota(),
    firmaDataUri: firma?.dataUri ?? null,
    firmaFecha: firma?.fecha ?? null,
  })
  const archivo = await subirArchivo(`activos/${activoId}`, `acta-${tipo}${firma ? '-firmada' : ''}.pdf`, pdf, 'application/pdf')
  const doc = await prisma.documento.create({
    data: { entidadTipo: 'Colaborador', entidadId: colaboradorId, nombre: `Acta de ${tipo} — ${activo.nombre}${firma ? ' (firmada)' : ''}`, bucket: archivo.bucket, storagePath: archivo.storagePath, mimeType: 'application/pdf', tamanoBytes: archivo.tamanoBytes, nivelAcceso: 'GENERAL', sedeId: colab.sedeId, subidoPorId: usuarioId },
  })
  return doc.id
}

export const asignarActivo = accion(
  {
    modulo: 'activos',
    accion: 'CREAR',
    schema: z.object({ activoId: z.uuid(), colaboradorId: z.uuid(), fechaEntrega: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), observaciones: z.string().max(300).optional() }),
  },
  async (d, usuario) => {
    const activo = await prisma.activo.findUniqueOrThrow({ where: { id: d.activoId } })
    if (activo.estado === 'ASIGNADO') throw new ErrorNegocio('El activo ya está asignado.')
    const actaId = await generarActa('entrega', d.activoId, d.colaboradorId, usuario.id)
    await dbAuditado.asignacionActivo.create({
      data: { activoId: d.activoId, colaboradorId: d.colaboradorId, fechaEntrega: parseFechaISO(d.fechaEntrega)!, actaEntregaDocId: actaId, observaciones: v(d.observaciones) },
    })
    await dbAuditado.activo.update({ where: { id: d.activoId }, data: { estado: 'ASIGNADO' } })
    // Aviso informativo: el acta ya quedó en su expediente.
    const usuarioColab = await usuarioDeColaborador(d.colaboradorId)
    if (usuarioColab) {
      await avisar(usuarioColab, {
        titulo: 'Se te asignó un activo — firma el acta',
        mensaje: `Se te entregó "${activo.nombre}" (${activo.codigo}). Entra a tu autoservicio para firmar el acta de entrega; recuerda custodiarlo y devolverlo cuando la empresa lo requiera.`,
        enlace: '/autoservicio/dotacion', llamadoAccion: 'Firmar el acta', evento: 'activo_asignado',
      })
    }
    revalidatePath('/activos')
    return { actaId }
  },
)

/**
 * El colaborador firma digitalmente el acta de entrega de SU activo desde
 * autoservicio (mismo patrón que el recibido de dotación): se regenera el PDF
 * con la firma incrustada y queda la constancia (firmaEntregaEn).
 */
export const firmarActaEntrega = accion(
  {
    modulo: 'autoservicio',
    accion: 'CREAR',
    schema: z.object({ asignacionId: z.uuid(), firmaDataUri: z.string().min(50) }),
  },
  async (d, usuario) => {
    const asig = await prisma.asignacionActivo.findUniqueOrThrow({ where: { id: d.asignacionId } })
    if (asig.colaboradorId !== usuario.colaboradorId) throw new ErrorNegocio('Esta asignación no es tuya.')
    if (asig.firmaEntregaEn) throw new ErrorNegocio('El acta de entrega ya está firmada.')
    const fecha = new Date()
    const actaId = await generarActa('entrega', asig.activoId, asig.colaboradorId, usuario.id, { dataUri: d.firmaDataUri, fecha })
    await dbAuditado.asignacionActivo.update({
      where: { id: d.asignacionId },
      data: { actaEntregaDocId: actaId, firmaEntregaEn: fecha },
    })
    revalidatePath('/autoservicio/dotacion')
    revalidatePath('/activos')
    return { actaId }
  },
)

export const devolverActivo = accion(
  { modulo: 'activos', accion: 'EDITAR', schema: z.object({ asignacionId: z.uuid() }) },
  async ({ asignacionId }, usuario) => {
    const asig = await prisma.asignacionActivo.findUniqueOrThrow({ where: { id: asignacionId } })
    if (asig.fechaDevolucion) throw new ErrorNegocio('El activo ya fue devuelto.')
    const actaId = await generarActa('devolucion', asig.activoId, asig.colaboradorId, usuario.id)
    await dbAuditado.asignacionActivo.update({ where: { id: asignacionId }, data: { fechaDevolucion: hoyBogota(), actaDevolucionDocId: actaId } })
    await dbAuditado.activo.update({ where: { id: asig.activoId }, data: { estado: 'DISPONIBLE' } })
    revalidatePath('/activos')
    return { actaId }
  },
)

export const registrarDotacion = accion(
  {
    modulo: 'activos',
    accion: 'CREAR',
    schema: z.object({ colaboradorId: z.uuid(), anio: z.coerce.number().int(), corte: z.enum(['Abril', 'Agosto', 'Diciembre']), items: z.string().min(3).max(500), fechaEntrega: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  },
  async (d, usuario) => {
    const entrega = await dbAuditado.entregaDotacion.create({
      data: { colaboradorId: d.colaboradorId, anio: d.anio, corte: d.corte, items: d.items, fechaEntrega: parseFechaISO(d.fechaEntrega)! },
    })
    // Recibido en PDF (arts. 230-234 CST) al expediente; el colaborador lo firma
    // digitalmente desde su autoservicio y queda la constancia.
    await generarRecibidoDotacion(entrega.id, usuario.id)
    const usuarioColab = await usuarioDeColaborador(d.colaboradorId)
    if (usuarioColab) {
      await avisar(usuarioColab, {
        titulo: 'Firma el recibido de tu dotación',
        mensaje: `Se registró la entrega de tu dotación (${d.corte} ${d.anio}: ${d.items}). Entra a tu autoservicio para firmar el recibido.`,
        enlace: '/autoservicio/dotacion', llamadoAccion: 'Firmar el recibido', evento: 'dotacion_entregada',
      })
    }
    revalidatePath('/activos')
    return { id: entrega.id }
  },
)

/**
 * El colaborador firma digitalmente el recibido de SU dotación desde autoservicio.
 * Regenera el PDF con la firma incrustada y deja la constancia (firmadoEn).
 */
export const firmarRecibidoDotacion = accion(
  {
    modulo: 'autoservicio',
    accion: 'CREAR',
    schema: z.object({ entregaId: z.uuid(), firmaDataUri: z.string().min(50) }),
  },
  async (d, usuario) => {
    const entrega = await prisma.entregaDotacion.findUniqueOrThrow({ where: { id: d.entregaId } })
    if (entrega.colaboradorId !== usuario.colaboradorId) throw new ErrorNegocio('Esta entrega de dotación no es tuya.')
    if (entrega.firmadoEn) throw new ErrorNegocio('Este recibido ya está firmado.')
    const docId = await generarRecibidoDotacion(d.entregaId, usuario.id, { dataUri: d.firmaDataUri, fecha: new Date() })
    await avisarPorRol(['Recursos Humanos', 'Administrador'], {
      titulo: 'Recibido de dotación firmado',
      mensaje: `Se firmó digitalmente el recibido de dotación ${entrega.corte} ${entrega.anio}. La constancia quedó en el expediente.`,
      enlace: '/activos?tab=dotacion', evento: 'dotacion_firmada',
    })
    revalidatePath('/autoservicio/dotacion')
    revalidatePath('/activos')
    return { docId }
  },
)
