'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado, auditar } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'

function slugify(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

const campoSchema = z.object({
  clave: z.string().min(1).max(40),
  etiqueta: z.string().min(1).max(80),
  tipo: z.enum(['TEXTO', 'TEXTO_LARGO', 'NUMERO', 'DECIMAL', 'MONEDA', 'FECHA', 'OPCION', 'SI_NO', 'COLABORADOR']),
  requerido: z.boolean(),
  opciones: z.string().optional(),
  generaAlerta: z.boolean(),
})

export const crearModulo = accion(
  {
    modulo: 'configuracion',
    accion: 'CREAR',
    schema: z.object({
      nombre: z.string().trim().min(2).max(80),
      icono: z.string().default('Layers'),
      seccion: z.string().default('Personalizados'),
      vinculo: z.enum(['GLOBAL', 'POR_COLABORADOR', 'POR_SEDE']),
      descripcion: z.string().max(300).optional(),
      campos: z.array(campoSchema).min(1, 'Agrega al menos un campo'),
    }),
  },
  async (d) => {
    const slug = slugify(d.nombre)
    const dup = await prisma.moduloPersonalizado.findUnique({ where: { slug } })
    if (dup) throw new ErrorNegocio('Ya existe un módulo con ese nombre.')

    const modulo = await dbAuditado.moduloPersonalizado.create({
      data: {
        slug, nombre: d.nombre, icono: d.icono, seccion: d.seccion, vinculo: d.vinculo, descripcion: d.descripcion,
        campos: {
          create: d.campos.map((c, i) => ({
            clave: slugify(c.clave) || `campo${i}`, etiqueta: c.etiqueta, tipo: c.tipo,
            requerido: c.requerido, opciones: c.opciones || null, generaAlerta: c.generaAlerta, orden: i,
          })),
        },
      },
    })
    revalidatePath('/configuracion/modulos')
    return { id: modulo.id, slug }
  },
)

const motivo = z.string().trim().min(5, 'Explica por qué se elimina.').max(300)

/** ¿Algún registro del módulo tiene valor en este campo? (vacío o nulo no cuenta). */
async function registrosConValor(moduloId: string, clave: string): Promise<number> {
  const registros = await prisma.registroPersonalizado.findMany({ where: { moduloId }, select: { datos: true } })
  return registros.filter((r) => {
    const v = (r.datos as Record<string, unknown>)[clave]
    return v !== undefined && v !== null && v !== ''
  }).length
}

/**
 * Borra un módulo creado por error, con el motivo (queda en auditoría). Solo si
 * no tiene registros: con datos adentro no hay forma de recuperarlos.
 */
export const eliminarModulo = accion(
  { modulo: 'configuracion', accion: 'ELIMINAR', schema: z.object({ id: z.uuid(), motivo }) },
  async ({ id, motivo }) => {
    const m = await prisma.moduloPersonalizado.findUniqueOrThrow({ where: { id }, include: { _count: { select: { registros: true } } } })
    if (m._count.registros > 0) {
      throw new ErrorNegocio(`No se puede eliminar: el módulo tiene ${m._count.registros} registro(s). Bórralos primero desde el módulo, o déjalo como está.`)
    }
    // Los campos se van en cascada; nunca hubo registros, así que no hay vencimientos.
    await dbAuditado.moduloPersonalizado.delete({ where: { id } })
    await auditar('ELIMINAR', 'ModuloPersonalizado', { registroId: id, descripcion: `Anulado: ${motivo}` })
    revalidatePath('/configuracion/modulos')
    revalidatePath('/', 'layout')
    return { ok: true }
  },
)

/** Corrige el nombre, la descripción, el ícono o la sección. El vínculo solo si aún no hay registros. */
export const editarModulo = accion(
  {
    modulo: 'configuracion',
    accion: 'EDITAR',
    schema: z.object({
      id: z.uuid(),
      nombre: z.string().trim().min(2).max(80),
      icono: z.string().trim().min(1).max(40),
      seccion: z.string().trim().min(1).max(60),
      vinculo: z.enum(['GLOBAL', 'POR_COLABORADOR', 'POR_SEDE']),
      descripcion: z.string().trim().max(300).optional(),
    }),
  },
  async (d) => {
    const m = await prisma.moduloPersonalizado.findUniqueOrThrow({ where: { id: d.id }, include: { _count: { select: { registros: true } } } })
    if (d.vinculo !== m.vinculo && m._count.registros > 0) {
      throw new ErrorNegocio('No se puede cambiar el vínculo de un módulo que ya tiene registros.')
    }
    // El slug no cambia: los permisos custom:{slug} y los enlaces dependen de él.
    await dbAuditado.moduloPersonalizado.update({
      where: { id: d.id },
      data: { nombre: d.nombre, icono: d.icono, seccion: d.seccion, vinculo: d.vinculo, descripcion: d.descripcion || null },
    })
    revalidatePath('/configuracion/modulos')
    revalidatePath(`/modulos/${m.slug}`)
    revalidatePath('/', 'layout')
    return { ok: true }
  },
)

/** Corrige un campo. El tipo solo se cambia si ningún registro tiene valor en él (los datos ya guardados no se convierten). */
export const editarCampo = accion(
  {
    modulo: 'configuracion',
    accion: 'EDITAR',
    schema: z.object({
      id: z.uuid(),
      etiqueta: z.string().trim().min(1).max(80),
      tipo: z.enum(['TEXTO', 'TEXTO_LARGO', 'NUMERO', 'DECIMAL', 'MONEDA', 'FECHA', 'OPCION', 'SI_NO', 'COLABORADOR']),
      requerido: z.boolean(),
      opciones: z.string().trim().max(500).optional(),
      generaAlerta: z.boolean(),
      mostrarEnTabla: z.boolean(),
    }),
  },
  async (d) => {
    const c = await prisma.campoPersonalizado.findUniqueOrThrow({ where: { id: d.id }, include: { modulo: { select: { slug: true } } } })
    if (d.tipo !== c.tipo) {
      const usados = await registrosConValor(c.moduloId, c.clave)
      if (usados > 0) throw new ErrorNegocio(`No se puede cambiar el tipo: ${usados} registro(s) ya tienen valor en «${c.etiqueta}». Crea otro campo en su lugar.`)
    }
    await dbAuditado.campoPersonalizado.update({
      where: { id: d.id },
      data: {
        etiqueta: d.etiqueta, tipo: d.tipo, requerido: d.requerido, opciones: d.opciones || null,
        generaAlerta: d.tipo === 'FECHA' ? d.generaAlerta : false, mostrarEnTabla: d.mostrarEnTabla,
      },
    })
    revalidatePath('/configuracion/modulos')
    revalidatePath(`/modulos/${c.modulo.slug}`)
    return { ok: true }
  },
)

/** Borra un campo, con el motivo, solo si ningún registro tiene valor en él. Nunca el último campo. */
export const eliminarCampo = accion(
  { modulo: 'configuracion', accion: 'ELIMINAR', schema: z.object({ id: z.uuid(), motivo }) },
  async ({ id, motivo }) => {
    const c = await prisma.campoPersonalizado.findUniqueOrThrow({ where: { id }, include: { modulo: { select: { slug: true, _count: { select: { campos: true } } } } } })
    if (c.modulo._count.campos <= 1) throw new ErrorNegocio('Es el único campo del módulo: agrega otro antes de borrarlo, o elimina el módulo.')
    const usados = await registrosConValor(c.moduloId, c.clave)
    if (usados > 0) throw new ErrorNegocio(`No se puede eliminar: ${usados} registro(s) tienen valor en «${c.etiqueta}». Vacíalo en esos registros primero.`)
    await dbAuditado.campoPersonalizado.delete({ where: { id } })
    await auditar('ELIMINAR', 'CampoPersonalizado', { registroId: id, descripcion: `Anulado: ${motivo}` })
    revalidatePath('/configuracion/modulos')
    revalidatePath(`/modulos/${c.modulo.slug}`)
    return { ok: true }
  },
)

export const agregarRegistro = accion(
  { modulo: 'configuracion', accion: 'CREAR', schema: z.object({ moduloId: z.uuid(), colaboradorId: z.string().optional(), sedeId: z.string().optional(), datos: z.record(z.string(), z.unknown()) }) },
  async (d) => {
    const registro = await dbAuditado.registroPersonalizado.create({
      data: { moduloId: d.moduloId, colaboradorId: d.colaboradorId || null, sedeId: d.sedeId || null, datos: d.datos as object },
    })
    const modulo = await prisma.moduloPersonalizado.findUniqueOrThrow({ where: { id: d.moduloId }, include: { campos: true } })
    await publicarVencimientosRegistro(modulo, registro.id, d.datos, d.sedeId || null)
    revalidatePath(`/modulos/${modulo.slug}`)
  },
)

type ModuloConCampos = { id: string; nombre: string; slug: string; campos: { clave: string; etiqueta: string; tipo: string; generaAlerta: boolean }[] }

/**
 * Campos FECHA con alerta → publican (o actualizan) un Vencimiento por registro.
 * Si la fecha se borró, el vencimiento se cancela para que no siga avisando.
 */
async function publicarVencimientosRegistro(modulo: ModuloConCampos, registroId: string, datos: Record<string, unknown>, sedeId: string | null) {
  const { publicarVencimiento, cancelarVencimiento } = await import('@/server/vencimientos/servicio')
  for (const campo of modulo.campos) {
    if (campo.tipo !== 'FECHA' || !campo.generaAlerta) continue
    const valor = datos[campo.clave]
    if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)) {
      await publicarVencimiento({
        origen: 'MODULO_PERSONALIZADO',
        entidadTipo: 'RegistroPersonalizado',
        entidadId: registroId,
        titulo: `${modulo.nombre}: ${campo.etiqueta}`,
        fechaVencimientoISO: valor,
        sedeId,
      })
    } else {
      await cancelarVencimiento('RegistroPersonalizado', registroId, 'MODULO_PERSONALIZADO')
    }
  }
}

/** Corrige un registro (todos sus campos). El vencimiento, si lo hay, sigue la fecha nueva. */
export const editarRegistro = accion(
  { modulo: 'configuracion', accion: 'EDITAR', schema: z.object({ id: z.uuid(), datos: z.record(z.string(), z.unknown()) }) },
  async (d) => {
    const r = await prisma.registroPersonalizado.findUniqueOrThrow({ where: { id: d.id }, include: { modulo: { include: { campos: true } } } })
    await dbAuditado.registroPersonalizado.update({ where: { id: d.id }, data: { datos: d.datos as object } })
    await publicarVencimientosRegistro(r.modulo, r.id, d.datos, r.sedeId)
    revalidatePath(`/modulos/${r.modulo.slug}`)
    return { ok: true }
  },
)

/** Borra un registro con el motivo (queda en auditoría); su vencimiento, si lo tenía, se cancela. */
export const eliminarRegistro = accion(
  { modulo: 'configuracion', accion: 'ELIMINAR', schema: z.object({ id: z.uuid(), motivo }) },
  async ({ id, motivo }) => {
    const r = await prisma.registroPersonalizado.findUniqueOrThrow({ where: { id }, include: { modulo: { select: { slug: true } } } })
    const { cancelarVencimiento } = await import('@/server/vencimientos/servicio')
    await cancelarVencimiento('RegistroPersonalizado', id)
    await dbAuditado.registroPersonalizado.delete({ where: { id } })
    await auditar('ELIMINAR', 'RegistroPersonalizado', { registroId: id, descripcion: `Anulado: ${motivo}` })
    revalidatePath(`/modulos/${r.modulo.slug}`)
    revalidatePath('/configuracion/modulos')
    return { ok: true }
  },
)
