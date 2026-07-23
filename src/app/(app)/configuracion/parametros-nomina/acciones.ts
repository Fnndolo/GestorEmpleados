'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'
import { parseFechaISO } from '@/lib/fechas'

/** Actualiza el valor vigente de un parámetro legal de nómina (SMMLV o auxilio de transporte). */
export const actualizarParametroNomina = accion(
  {
    modulo: 'configuracion',
    accion: 'EDITAR',
    schema: z.object({
      clave: z.enum(['SMMLV', 'AUX_TRANSPORTE']),
      valor: z.coerce.number().min(0),
    }),
  },
  async (d) => {
    const actual = await prisma.parametroLegal.findFirst({ where: { clave: d.clave }, orderBy: { vigenciaDesde: 'desc' } })
    if (!actual) throw new ErrorNegocio('No existe el parámetro. Ejecuta el seed de nómina primero.')
    await dbAuditado.parametroLegal.update({ where: { id: actual.id }, data: { valor: d.valor } })
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
      codigo: z.enum(['HED', 'HEN', 'RN', 'RD', 'RND', 'HEDD', 'HEND']),
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
