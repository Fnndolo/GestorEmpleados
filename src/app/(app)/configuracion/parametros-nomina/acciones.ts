'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado, auditar } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'
import { parseFechaISO, formatFechaISO } from '@/lib/fechas'
import { esClaveDelMotor } from '@/lib/nomina/claves-motor'

const fechaISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Indica la fecha.')
const motivo = z.string().trim().min(5, 'Explica por qué se elimina.').max(300)

/** Códigos de hora que el motor de nómina lee por nombre (ver cargarTiposHora). */
const CODIGOS_MOTOR: readonly string[] = ['HED', 'HEN', 'RN', 'RD', 'RND', 'HEDD', 'HEND']

/** El día anterior (para cerrar la vigencia previa). */
function diaAntes(d: Date): Date {
  const c = new Date(d)
  c.setUTCDate(c.getUTCDate() - 1)
  return c
}

/**
 * Una vigencia que una nómina CERRADA o PAGADA ya usó no se toca: cambiarla
 * dejaría la liquidación sin forma de explicarse. Se considera usada si algún
 * periodo cerrado se cruza con [desde, hasta].
 */
async function exigirVigenciaSinNominaCerrada(desde: Date, hasta: Date | null, que: string): Promise<void> {
  const periodo = await prisma.periodoNomina.findFirst({
    where: { estado: { in: ['CERRADA', 'PAGADA'] }, fechaInicio: { lte: hasta ?? new Date('9999-12-31') }, fechaFin: { gte: desde } },
    select: { nombre: true },
  })
  if (periodo) throw new ErrorNegocio(`${que} ya la usó la nómina cerrada «${periodo.nombre}»: no se puede cambiar ni eliminar. Registra una nueva vigencia en su lugar.`)
}

/**
 * Corrige UNA vigencia de un parámetro legal (valor y desde cuándo rige): la
 * fila mal digitada. No cambia la que ya usó una nómina cerrada; para eso se
 * registra una vigencia nueva. Al mover la fecha, la vigencia anterior se
 * cierra el día antes para que no quede un hueco ni un traslape.
 */
export const actualizarParametroNomina = accion(
  {
    modulo: 'configuracion',
    accion: 'EDITAR',
    schema: z.object({
      id: z.uuid(),
      valor: z.coerce.number().min(0),
      vigenciaDesde: fechaISO,
      fuenteLegal: z.string().trim().max(200).optional(),
    }),
  },
  async (d) => {
    const v = await prisma.parametroLegal.findUniqueOrThrow({ where: { id: d.id } })
    await exigirVigenciaSinNominaCerrada(v.vigenciaDesde, v.vigenciaHasta, `La vigencia de ${v.clave} desde ${formatFechaISO(v.vigenciaDesde)}`)
    const desde = parseFechaISO(d.vigenciaDesde)!
    const todas = await prisma.parametroLegal.findMany({ where: { clave: v.clave }, orderBy: { vigenciaDesde: 'asc' } })
    const i = todas.findIndex((p) => p.id === v.id)
    const anterior = i > 0 ? todas[i - 1] : null
    const siguiente = i < todas.length - 1 ? todas[i + 1] : null
    if (anterior && desde <= anterior.vigenciaDesde) throw new ErrorNegocio(`Debe empezar después de la vigencia anterior (${formatFechaISO(anterior.vigenciaDesde)}).`)
    if (siguiente && desde >= siguiente.vigenciaDesde) throw new ErrorNegocio(`Debe empezar antes de la vigencia siguiente (${formatFechaISO(siguiente.vigenciaDesde)}).`)
    if (v.vigenciaHasta && desde > v.vigenciaHasta) throw new ErrorNegocio(`No puede empezar después de su fin (${formatFechaISO(v.vigenciaHasta)}).`)

    await dbAuditado.parametroLegal.update({
      where: { id: v.id },
      data: { valor: d.valor, vigenciaDesde: desde, fuenteLegal: d.fuenteLegal || v.fuenteLegal },
    })
    if (anterior && +desde !== +v.vigenciaDesde) {
      await dbAuditado.parametroLegal.update({ where: { id: anterior.id }, data: { vigenciaHasta: diaAntes(desde) } })
    }
    revalidatePath('/configuracion/parametros-nomina')
    return { ok: true }
  },
)

/**
 * Registra una NUEVA vigencia de un parámetro legal (porcentajes, UVT, topes…):
 * cierra la vigencia actual el día anterior y crea la nueva. El histórico se
 * conserva, así los periodos ya liquidados siguen siendo auditables.
 */
export const registrarVigenciaParametro = accion(
  {
    modulo: 'configuracion',
    accion: 'EDITAR',
    schema: z.object({
      clave: z.string().min(2).max(40).regex(/^[A-Z0-9_]+$/, 'La clave va en MAYÚSCULAS_CON_GUIONES'),
      valor: z.coerce.number().min(0),
      vigenciaDesde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      fuenteLegal: z.string().max(200).optional(),
    }),
  },
  async (d) => {
    const desde = parseFechaISO(d.vigenciaDesde)!
    const actual = await prisma.parametroLegal.findFirst({ where: { clave: d.clave }, orderBy: { vigenciaDesde: 'desc' } })

    if (actual && +actual.vigenciaDesde === +desde) {
      // Misma fecha de inicio: se corrige el valor de esa vigencia.
      await dbAuditado.parametroLegal.update({
        where: { id: actual.id },
        data: { valor: d.valor, fuenteLegal: d.fuenteLegal || actual.fuenteLegal },
      })
    } else {
      if (actual && actual.vigenciaDesde > desde) {
        throw new ErrorNegocio('La nueva vigencia debe iniciar después de la vigencia actual.')
      }
      if (actual) {
        const cierre = new Date(desde)
        cierre.setUTCDate(cierre.getUTCDate() - 1)
        await dbAuditado.parametroLegal.update({ where: { id: actual.id }, data: { vigenciaHasta: cierre } })
      }
      await dbAuditado.parametroLegal.create({
        data: {
          clave: d.clave, valor: d.valor, vigenciaDesde: desde,
          fuenteLegal: d.fuenteLegal || actual?.fuenteLegal || 'Actualización manual',
          descripcion: actual?.descripcion ?? null,
        },
      })
    }
    revalidatePath('/configuracion/parametros-nomina')
    return { ok: true }
  },
)

/**
 * Registra una NUEVA vigencia del factor de un tipo de hora (extras y recargos):
 * cierra la vigencia actual y crea la nueva, conservando el histórico. Así se
 * manejan sin código los cambios de ley (p. ej. recargo dominical 80→90→100%).
 */
export const registrarVigenciaTipoHora = accion(
  {
    modulo: 'configuracion',
    accion: 'EDITAR',
    schema: z.object({
      // Los códigos de ley y los que la empresa haya creado con «Nuevo tipo de hora».
      codigo: z.string().trim().min(2).max(10).regex(/^[A-Z0-9_]+$/),
      factor: z.coerce.number().min(0).max(5),
      vigenteDesde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  },
  async (d) => {
    const desde = parseFechaISO(d.vigenteDesde)!
    const actual = await prisma.tipoHora.findFirst({ where: { codigo: d.codigo }, orderBy: { vigenteDesde: 'desc' } })
    if (!actual) throw new ErrorNegocio('No existe el tipo de hora. Ejecuta el seed de nómina primero.')

    if (+actual.vigenteDesde === +desde) {
      await dbAuditado.tipoHora.update({ where: { id: actual.id }, data: { factor: d.factor } })
    } else {
      if (actual.vigenteDesde > desde) throw new ErrorNegocio('La nueva vigencia debe iniciar después de la vigencia actual.')
      const cierre = new Date(desde)
      cierre.setUTCDate(cierre.getUTCDate() - 1)
      await dbAuditado.tipoHora.update({ where: { id: actual.id }, data: { vigenteHasta: cierre } })
      await dbAuditado.tipoHora.create({
        data: { codigo: d.codigo, nombre: actual.nombre, factor: d.factor, vigenteDesde: desde },
      })
    }
    revalidatePath('/configuracion/parametros-nomina')
    return { ok: true }
  },
)

/** Interruptores de nómina: retención en la fuente y exoneración Ley 114-1. */
export const actualizarInterruptoresNomina = accion(
  {
    modulo: 'configuracion',
    accion: 'EDITAR',
    schema: z.object({
      aplicaRetefuente: z.boolean(),
      empresaExonerada: z.boolean(),
    }),
  },
  async (d) => {
    const config = await prisma.configuracionEmpresa.findFirst()
    if (!config) throw new ErrorNegocio('Configura primero los datos de la empresa.')
    await dbAuditado.configuracionEmpresa.update({
      where: { id: config.id },
      data: { aplicaRetefuente: d.aplicaRetefuente, empresaExonerada: d.empresaExonerada },
    })
    revalidatePath('/configuracion/parametros-nomina')
    return { ok: true }
  },
)

const RUTA_PARAMETROS = '/configuracion/parametros-nomina'

/**
 * Crea un parámetro legal que no existía: una clave propia de la empresa, o una
 * de las de ley si se perdió.
 *
 * La pantalla solo sabía registrar nuevas vigencias de lo que ya estaba, así que
 * sobre una base vacía no había forma de arrancar sin correr el seed a mano.
 */
export const crearParametro = accion(
  {
    modulo: 'configuracion',
    accion: 'CREAR',
    schema: z.object({
      clave: z.string().trim().min(2).max(40).regex(/^[A-Z0-9_]+$/, 'La clave va en MAYÚSCULAS_CON_GUION_BAJO'),
      valor: z.coerce.number().min(0),
      vigenciaDesde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      fuenteLegal: z.string().trim().max(200).optional(),
      descripcion: z.string().trim().max(200).optional(),
    }),
  },
  async (d) => {
    const clave = d.clave.trim().toUpperCase()
    const existe = await prisma.parametroLegal.findFirst({ where: { clave } })
    if (existe) {
      throw new ErrorNegocio(`El parámetro ${clave} ya existe. Usa «Nueva vigencia» para cambiarle el valor.`)
    }
    const creado = await dbAuditado.parametroLegal.create({
      data: {
        clave,
        valor: d.valor,
        vigenciaDesde: parseFechaISO(d.vigenciaDesde)!,
        fuenteLegal: d.fuenteLegal || 'Registro manual',
        descripcion: d.descripcion || null,
      },
    })
    revalidatePath(RUTA_PARAMETROS)
    return { id: creado.id }
  },
)

/**
 * Borra UNA vigencia (la fila mal digitada) y reabre la anterior si esta era la
 * última, para que no quede un hueco sin valor vigente.
 *
 * No se permite dejar sin ninguna vigencia a una clave que el motor lee: la
 * nómina dejaría de calcular y el fallo saldría lejos de esta pantalla.
 */
export const eliminarVigenciaParametro = accion(
  { modulo: 'configuracion', accion: 'ELIMINAR', schema: z.object({ id: z.uuid() }) },
  async ({ id }) => {
    const v = await prisma.parametroLegal.findUniqueOrThrow({ where: { id } })
    await exigirVigenciaSinNominaCerrada(v.vigenciaDesde, v.vigenciaHasta, `La vigencia de ${v.clave} desde ${formatFechaISO(v.vigenciaDesde)}`)
    const todas = await prisma.parametroLegal.findMany({
      where: { clave: v.clave },
      orderBy: { vigenciaDesde: 'desc' },
    })
    if (todas.length === 1 && esClaveDelMotor(v.clave)) {
      throw new ErrorNegocio(
        `${v.clave} es una de las claves que usa el motor de nómina: no puede quedarse sin ninguna vigencia. Registra el valor correcto y luego borra el equivocado.`,
      )
    }
    await dbAuditado.parametroLegal.delete({ where: { id } })

    // Si era la más reciente, la anterior vuelve a quedar abierta.
    const anterior = todas.find((p) => p.id !== id && p.vigenciaDesde < v.vigenciaDesde)
    const eraLaUltima = todas[0]?.id === id
    if (eraLaUltima && anterior) {
      await dbAuditado.parametroLegal.update({ where: { id: anterior.id }, data: { vigenciaHasta: null } })
    }
    revalidatePath(RUTA_PARAMETROS)
    return { clave: v.clave }
  },
)

/** Borra un parámetro con todo su histórico. Solo los que el motor no lee. */
export const eliminarParametro = accion(
  { modulo: 'configuracion', accion: 'ELIMINAR', schema: z.object({ clave: z.string().trim().min(2).max(40) }) },
  async ({ clave }) => {
    const c = clave.trim().toUpperCase()
    if (esClaveDelMotor(c)) {
      throw new ErrorNegocio(
        `${c} la usa el motor de nómina para calcular: no se puede eliminar. Si el valor cambió, registra una nueva vigencia.`,
      )
    }
    const { count } = await prisma.parametroLegal.deleteMany({ where: { clave: c } })
    if (count === 0) throw new ErrorNegocio(`No existe el parámetro ${c}.`)
    revalidatePath(RUTA_PARAMETROS)
    return { eliminadas: count }
  },
)

// ── Tipos de hora: crear, corregir una vigencia y borrar una vigencia ──────────

/**
 * Crea un tipo de hora que no existía (un recargo propio de la empresa, o uno
 * de ley que se perdió). Los que el motor lee van por código exacto.
 */
export const crearTipoHora = accion(
  {
    modulo: 'configuracion',
    accion: 'CREAR',
    schema: z.object({
      codigo: z.string().trim().min(2).max(10).regex(/^[A-Z0-9_]+$/, 'El código va en MAYÚSCULAS'),
      nombre: z.string().trim().min(3, 'Ponle un nombre.').max(80),
      factor: z.coerce.number().min(0).max(5),
      vigenteDesde: fechaISO,
    }),
  },
  async (d) => {
    const codigo = d.codigo.trim().toUpperCase()
    if (await prisma.tipoHora.findFirst({ where: { codigo } })) {
      throw new ErrorNegocio(`El tipo de hora ${codigo} ya existe. Usa «Nueva vigencia» para cambiarle el factor.`)
    }
    const creado = await dbAuditado.tipoHora.create({ data: { codigo, nombre: d.nombre, factor: d.factor, vigenteDesde: parseFechaISO(d.vigenteDesde)! } })
    revalidatePath(RUTA_PARAMETROS)
    return { id: creado.id }
  },
)

/**
 * Corrige UNA vigencia de un tipo de hora (factor y desde cuándo rige), si
 * ninguna nómina cerrada la usó. Al mover la fecha, la vigencia anterior se
 * cierra el día antes.
 */
export const editarVigenciaTipoHora = accion(
  {
    modulo: 'configuracion',
    accion: 'EDITAR',
    schema: z.object({ id: z.uuid(), factor: z.coerce.number().min(0).max(5), vigenteDesde: fechaISO }),
  },
  async (d) => {
    const v = await prisma.tipoHora.findUniqueOrThrow({ where: { id: d.id } })
    await exigirVigenciaSinNominaCerrada(v.vigenteDesde, v.vigenteHasta, `La vigencia de ${v.codigo} desde ${formatFechaISO(v.vigenteDesde)}`)
    const desde = parseFechaISO(d.vigenteDesde)!
    const todas = await prisma.tipoHora.findMany({ where: { codigo: v.codigo }, orderBy: { vigenteDesde: 'asc' } })
    const i = todas.findIndex((t) => t.id === v.id)
    const anterior = i > 0 ? todas[i - 1] : null
    const siguiente = i < todas.length - 1 ? todas[i + 1] : null
    if (anterior && desde <= anterior.vigenteDesde) throw new ErrorNegocio(`Debe empezar después de la vigencia anterior (${formatFechaISO(anterior.vigenteDesde)}).`)
    if (siguiente && desde >= siguiente.vigenteDesde) throw new ErrorNegocio(`Debe empezar antes de la vigencia siguiente (${formatFechaISO(siguiente.vigenteDesde)}).`)
    if (v.vigenteHasta && desde > v.vigenteHasta) throw new ErrorNegocio(`No puede empezar después de su fin (${formatFechaISO(v.vigenteHasta)}).`)

    await dbAuditado.tipoHora.update({ where: { id: v.id }, data: { factor: d.factor, vigenteDesde: desde } })
    if (anterior && +desde !== +v.vigenteDesde) {
      await dbAuditado.tipoHora.update({ where: { id: anterior.id }, data: { vigenteHasta: diaAntes(desde) } })
    }
    revalidatePath(RUTA_PARAMETROS)
    return { ok: true }
  },
)

/**
 * Borra UNA vigencia de un tipo de hora (la fila mal digitada), con el motivo.
 * Nunca la que usó una nómina cerrada, ni la última de un código que el motor
 * lee (las horas extra dejarían de liquidarse). Si era la más reciente, la
 * anterior vuelve a quedar abierta.
 */
export const eliminarVigenciaTipoHora = accion(
  { modulo: 'configuracion', accion: 'ELIMINAR', schema: z.object({ id: z.uuid(), motivo }) },
  async ({ id, motivo }) => {
    const v = await prisma.tipoHora.findUniqueOrThrow({ where: { id } })
    await exigirVigenciaSinNominaCerrada(v.vigenteDesde, v.vigenteHasta, `La vigencia de ${v.codigo} desde ${formatFechaISO(v.vigenteDesde)}`)
    const todas = await prisma.tipoHora.findMany({ where: { codigo: v.codigo }, orderBy: { vigenteDesde: 'desc' } })
    if (todas.length === 1 && CODIGOS_MOTOR.includes(v.codigo)) {
      throw new ErrorNegocio(`${v.codigo} lo usa el motor de nómina: no puede quedarse sin ninguna vigencia. Registra el factor correcto y luego borra el equivocado.`)
    }
    await dbAuditado.tipoHora.delete({ where: { id } })
    await auditar('ELIMINAR', 'TipoHora', { registroId: id, descripcion: `Anulado: ${motivo}` })
    const anterior = todas.find((t) => t.id !== id && t.vigenteDesde < v.vigenteDesde)
    if (todas[0]?.id === id && anterior) {
      await dbAuditado.tipoHora.update({ where: { id: anterior.id }, data: { vigenteHasta: null } })
    }
    revalidatePath(RUTA_PARAMETROS)
    return { codigo: v.codigo }
  },
)
