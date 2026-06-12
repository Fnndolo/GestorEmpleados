'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'
import { parseFechaISO, hoyBogota } from '@/lib/fechas'
import { subirArchivo } from '@/server/storage'
import { renderActaActivo } from '@/server/pdf/acta-activo'

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

async function generarActa(tipo: 'entrega' | 'devolucion', activoId: string, colaboradorId: string, usuarioId: string): Promise<string> {
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
  })
  const archivo = await subirArchivo(`activos/${activoId}`, `acta-${tipo}.pdf`, pdf, 'application/pdf')
  const doc = await prisma.documento.create({
    data: { entidadTipo: 'Colaborador', entidadId: colaboradorId, nombre: `Acta de ${tipo} — ${activo.nombre}`, bucket: archivo.bucket, storagePath: archivo.storagePath, mimeType: 'application/pdf', tamanoBytes: archivo.tamanoBytes, nivelAcceso: 'GENERAL', sedeId: colab.sedeId, subidoPorId: usuarioId },
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
  async (d) => {
    await dbAuditado.entregaDotacion.create({
      data: { colaboradorId: d.colaboradorId, anio: d.anio, corte: d.corte, items: d.items, fechaEntrega: parseFechaISO(d.fechaEntrega)! },
    })
    revalidatePath('/activos')
  },
)
