'use server'

import { randomUUID } from 'node:crypto'
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

/**
 * Genera UNA acta para uno o varios activos entregados (o devueltos) en el mismo
 * acto. `activoIds` conserva el orden en que se eligieron, que es el que se ve
 * en la tabla del PDF.
 */
async function generarActa(
  tipo: 'entrega' | 'devolucion',
  activoIds: string[],
  colaboradorId: string,
  usuarioId: string,
  firma?: { dataUri: string; fecha: Date },
): Promise<string> {
  if (activoIds.length === 0) throw new ErrorNegocio('No hay activos para el acta.')
  const encontrados = await prisma.activo.findMany({ where: { id: { in: activoIds } } })
  if (encontrados.length !== activoIds.length) throw new ErrorNegocio('Alguno de los activos ya no existe.')
  // findMany no respeta el orden de `in`: se reordena para que el acta liste los
  // activos como los eligió quien la genera.
  const porId = new Map(encontrados.map((a) => [a.id, a]))
  const activos = activoIds.map((id) => porId.get(id)!)

  const colab = await prisma.colaborador.findUniqueOrThrow({ where: { id: colaboradorId }, include: { cargo: true, sede: { include: { ciudad: true } } } })
  const empresa = await prisma.configuracionEmpresa.findFirstOrThrow()
  const pdf = await renderActaActivo({
    tipo,
    empresa: { razonSocial: empresa.razonSocial, nombreComercial: empresa.nombreComercial, nit: empresa.nit, direccion: empresa.direccion, telefono: empresa.telefono, emailContacto: empresa.emailContacto },
    colaborador: { nombre: `${colab.nombres} ${colab.apellidos}`, documento: colab.numeroDocumento, cargo: colab.cargo?.nombre ?? null },
    activos: activos.map((a) => ({ codigo: a.codigo, nombre: a.nombre, tipo: a.tipo, marca: a.marca, serie: a.serie, valor: a.valor ? Number(a.valor) : null })),
    ciudad: colab.sede.ciudad.nombre,
    fecha: hoyBogota(),
    firmaDataUri: firma?.dataUri ?? null,
    firmaFecha: firma?.fecha ?? null,
  })

  const nombreActa = activos.length === 1
    ? `Acta de ${tipo} — ${activos[0].nombre}`
    : `Acta de ${tipo} — ${activos.length} activos`
  const archivo = await subirArchivo(`activos/${activoIds[0]}`, `acta-${tipo}${firma ? '-firmada' : ''}.pdf`, pdf, 'application/pdf')
  const doc = await prisma.documento.create({
    data: { entidadTipo: 'Colaborador', entidadId: colaboradorId, nombre: `${nombreActa}${firma ? ' (firmada)' : ''}`, bucket: archivo.bucket, storagePath: archivo.storagePath, mimeType: 'application/pdf', tamanoBytes: archivo.tamanoBytes, nivelAcceso: 'GENERAL', sedeId: colab.sedeId, subidoPorId: usuarioId },
  })
  return doc.id
}

/**
 * Entrega uno o varios activos a un colaborador en un mismo acto: se genera UNA
 * sola acta con todos y cada asignación queda marcada con el mismo `loteId`, de
 * modo que firmarla cubre el lote completo.
 */
export const asignarActivos = accion(
  {
    modulo: 'activos',
    accion: 'CREAR',
    schema: z.object({
      activoIds: z.array(z.uuid()).min(1, 'Selecciona al menos un activo').max(50),
      colaboradorId: z.uuid(),
      fechaEntrega: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      observaciones: z.string().max(300).optional(),
    }),
  },
  async (d, usuario) => {
    // Se quitan repetidos por si el cliente manda dos veces el mismo activo.
    const activoIds = [...new Set(d.activoIds)]
    const activos = await prisma.activo.findMany({ where: { id: { in: activoIds } } })
    if (activos.length !== activoIds.length) throw new ErrorNegocio('Alguno de los activos ya no existe.')
    const ocupados = activos.filter((a) => a.estado === 'ASIGNADO')
    if (ocupados.length > 0) {
      throw new ErrorNegocio(`Ya está(n) asignado(s): ${ocupados.map((a) => a.nombre).join(', ')}.`)
    }

    const actaId = await generarActa('entrega', activoIds, d.colaboradorId, usuario.id)
    const loteId = randomUUID()
    const fechaEntrega = parseFechaISO(d.fechaEntrega)!
    await dbAuditado.asignacionActivo.createMany({
      data: activoIds.map((activoId) => ({
        activoId, colaboradorId: d.colaboradorId, fechaEntrega,
        actaEntregaDocId: actaId, loteId, observaciones: v(d.observaciones),
      })),
    })
    await dbAuditado.activo.updateMany({ where: { id: { in: activoIds } }, data: { estado: 'ASIGNADO' } })

    // Aviso informativo: el acta ya quedó en su expediente.
    const usuarioColab = await usuarioDeColaborador(d.colaboradorId)
    if (usuarioColab) {
      const detalle = activos.length === 1
        ? `"${activos[0].nombre}" (${activos[0].codigo})`
        : `${activos.length} activos: ${activos.map((a) => a.nombre).join(', ')}`
      await avisar(usuarioColab, {
        titulo: `Se te asignó ${activos.length === 1 ? 'un activo' : 'material'} — firma el acta`,
        mensaje: `Se te entregó ${detalle}. Entra a tu autoservicio para firmar el acta de entrega; recuerda custodiar${activos.length === 1 ? 'lo' : 'los'} y devolver${activos.length === 1 ? 'lo' : 'los'} cuando la empresa lo requiera.`,
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

    // El acta cubre todo el lote: se regenera con los mismos activos y la firma
    // se aplica a todas las asignaciones que comparten esa hoja.
    const hermanas = asig.loteId
      ? await prisma.asignacionActivo.findMany({ where: { loteId: asig.loteId }, orderBy: { creadoEn: 'asc' } })
      : [asig]
    const fecha = new Date()
    const actaId = await generarActa('entrega', hermanas.map((h) => h.activoId), asig.colaboradorId, usuario.id, { dataUri: d.firmaDataUri, fecha })
    await dbAuditado.asignacionActivo.updateMany({
      where: { id: { in: hermanas.map((h) => h.id) } },
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
    const actaId = await generarActa('devolucion', [asig.activoId], asig.colaboradorId, usuario.id)
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
