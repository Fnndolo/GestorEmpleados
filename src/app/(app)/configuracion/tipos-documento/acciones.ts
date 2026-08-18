'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'
import { tipoDocumentoSchema, type TipoDocumentoInput } from '@/lib/validaciones/catalogos'

const RUTA = '/configuracion/tipos-documento'

/** Los tipos alimentan la carga de documentos y el cálculo de vencimientos. */
function revalidarTipos() {
  revalidatePath(RUTA)
  revalidatePath('/', 'layout')
}

function datosTipo(d: TipoDocumentoInput) {
  return {
    nombre: d.nombre,
    descripcion: d.descripcion || null,
    requiereVencimiento: d.requiereVencimiento,
    nivelAcceso: d.nivelAcceso,
    // Sin vencimiento no tiene sentido guardar días de alerta.
    diasPrimeraAlerta: d.requiereVencimiento ? (d.diasPrimeraAlerta ?? null) : null,
    diasUltimaAlerta: d.requiereVencimiento ? (d.diasUltimaAlerta ?? null) : null,
    activo: d.activo,
  }
}

async function sinDuplicados<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new ErrorNegocio('Ya existe un tipo de documento con ese nombre.')
    }
    throw e
  }
}

/** Reemplaza los vínculos para los que el documento es obligatorio. */
async function guardarRequeridos(tipoDocumentoId: string, vinculos: TipoDocumentoInput['vinculosObligatorios']) {
  await prisma.documentoRequerido.deleteMany({ where: { tipoDocumentoId } })
  if (vinculos.length > 0) {
    await prisma.documentoRequerido.createMany({
      data: vinculos.map((tipoVinculo) => ({ tipoDocumentoId, tipoVinculo, obligatorio: true })),
    })
  }
}

export const crearTipoDocumento = accion(
  { modulo: 'configuracion', accion: 'CREAR', schema: tipoDocumentoSchema },
  async (datos) => {
    const creado = await sinDuplicados(() => dbAuditado.tipoDocumento.create({ data: datosTipo(datos) }))
    await guardarRequeridos(creado.id, datos.vinculosObligatorios)
    revalidarTipos()
    return { ok: true }
  },
)

export const editarTipoDocumento = accion(
  { modulo: 'configuracion', accion: 'EDITAR', schema: tipoDocumentoSchema.extend({ id: z.uuid() }) },
  async ({ id, ...resto }) => {
    await sinDuplicados(() => dbAuditado.tipoDocumento.update({ where: { id }, data: datosTipo(resto) }))
    await guardarRequeridos(id, resto.vinculosObligatorios)
    revalidarTipos()
    return { ok: true }
  },
)

export const alternarTipoDocumento = accion(
  { modulo: 'configuracion', accion: 'EDITAR', schema: z.object({ id: z.uuid(), activo: z.boolean() }) },
  async ({ id, activo }) => {
    await dbAuditado.tipoDocumento.update({ where: { id }, data: { activo } })
    revalidarTipos()
    return { ok: true }
  },
)

export const eliminarTipoDocumento = accion(
  { modulo: 'configuracion', accion: 'ELIMINAR', schema: z.object({ id: z.uuid() }) },
  async ({ id }) => {
    // Si ya hay documentos cargados de este tipo, borrarlo dejaría archivos
    // huérfanos: en ese caso el camino es desactivarlo.
    const tipo = await prisma.tipoDocumento.findUniqueOrThrow({
      where: { id },
      include: { _count: { select: { documentos: true } } },
    })
    if (tipo._count.documentos > 0) {
      throw new ErrorNegocio(
        `No se puede eliminar: hay ${tipo._count.documentos} documento(s) cargado(s) de este tipo. Desactívalo en su lugar.`,
      )
    }
    // Los requeridos caen solos por el onDelete: Cascade de la relación.
    await dbAuditado.tipoDocumento.delete({ where: { id } })
    revalidarTipos()
    return { ok: true }
  },
)
