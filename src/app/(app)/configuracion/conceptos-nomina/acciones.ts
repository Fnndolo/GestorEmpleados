'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'

const conceptoSchema = z.object({
  id: z.uuid().optional(), // presente al editar
  codigo: z.string().trim().min(2).max(30).regex(/^[A-Z0-9_]+$/, 'El código va en MAYÚSCULAS_CON_GUIONES'),
  nombre: z.string().trim().min(3).max(100),
  tipo: z.enum(['DEVENGADO', 'DEDUCCION']),
  // Art. 127/128 CST: un pago constitutivo de salario entra al IBC y a las bases
  // de prestaciones y vacaciones. Las banderas finas permiten el ajuste puntual.
  constitutivoSalario: z.boolean(),
  afectaIbcSs: z.boolean(),
  basePrestaciones: z.boolean(),
  baseVacaciones: z.boolean(),
  valorFijo: z.coerce.number().min(0).optional(),
  cuentaContable: z.string().trim().max(30).optional(),
  activo: z.boolean().default(true),
})

/** Crea o edita un concepto configurable del catálogo. Los de sistema no se tocan. */
export const guardarConceptoNomina = accion(
  { modulo: 'configuracion', accion: 'EDITAR', schema: conceptoSchema },
  async (d) => {
    if (d.tipo === 'DEDUCCION' && (d.constitutivoSalario || d.afectaIbcSs || d.basePrestaciones || d.baseVacaciones)) {
      throw new ErrorNegocio('Una deducción no puede ser constitutiva de salario ni afectar bases.')
    }

    const datos = {
      nombre: d.nombre,
      tipo: d.tipo,
      tipoCalculo: 'VALOR_FIJO' as const,
      constitutivoSalario: d.constitutivoSalario,
      afectaIbcSs: d.afectaIbcSs,
      basePrestaciones: d.basePrestaciones,
      baseVacaciones: d.baseVacaciones,
      valorFijo: d.valorFijo || null,
      cuentaContable: d.cuentaContable || null,
      activo: d.activo,
    }

    if (d.id) {
      const actual = await prisma.conceptoNomina.findUniqueOrThrow({ where: { id: d.id } })
      if (actual.esSistema) throw new ErrorNegocio('Los conceptos del sistema tienen tratamiento de ley y no se editan.')
      await dbAuditado.conceptoNomina.update({ where: { id: d.id }, data: datos })
    } else {
      const dup = await prisma.conceptoNomina.findUnique({ where: { codigo: d.codigo } })
      if (dup) throw new ErrorNegocio(`Ya existe un concepto con el código ${d.codigo}.`)
      await dbAuditado.conceptoNomina.create({ data: { codigo: d.codigo, ...datos } })
    }
    revalidatePath('/configuracion/conceptos-nomina')
    return { ok: true }
  },
)

/** Activa/desactiva un concepto (los inactivos no se liquidan ni se pueden aplicar). */
export const alternarConceptoNomina = accion(
  { modulo: 'configuracion', accion: 'EDITAR', schema: z.object({ id: z.uuid(), activo: z.boolean() }) },
  async (d) => {
    const c = await prisma.conceptoNomina.findUniqueOrThrow({ where: { id: d.id } })
    if (c.esSistema) throw new ErrorNegocio('Los conceptos del sistema no se desactivan.')
    await dbAuditado.conceptoNomina.update({ where: { id: d.id }, data: { activo: d.activo } })
    revalidatePath('/configuracion/conceptos-nomina')
    return { ok: true }
  },
)

const RUTA_CONCEPTOS = '/configuracion/conceptos-nomina'

/**
 * Cambia la cuenta contable de un concepto del sistema.
 *
 * Es el único campo suyo que se puede tocar: no entra en ningún cálculo, solo
 * en el asiento contable, y cada empresa tiene su propio plan de cuentas. Las
 * demás banderas siguen bloqueadas porque su comportamiento está programado en
 * el motor: cambiarlas haría que la pantalla dijera una cosa y el cálculo otra.
 */
export const actualizarCuentaContable = accion(
  {
    modulo: 'configuracion',
    accion: 'EDITAR',
    schema: z.object({ id: z.uuid(), cuentaContable: z.string().trim().max(30) }),
  },
  async (d) => {
    await dbAuditado.conceptoNomina.update({
      where: { id: d.id },
      data: { cuentaContable: d.cuentaContable || null },
    })
    revalidatePath(RUTA_CONCEPTOS)
    return { ok: true }
  },
)

/**
 * Borra un concepto propio de la empresa que nunca se usó.
 *
 * Si ya se aplicó en alguna liquidación no se borra: el desprendible dejaría de
 * poder explicar de dónde salió esa línea. Para esos casos está desactivarlo,
 * que impide usarlo de nuevo sin tocar lo ya liquidado.
 */
export const eliminarConceptoNomina = accion(
  { modulo: 'configuracion', accion: 'ELIMINAR', schema: z.object({ id: z.uuid() }) },
  async ({ id }) => {
    const c = await prisma.conceptoNomina.findUniqueOrThrow({ where: { id } })
    if (c.esSistema) {
      throw new ErrorNegocio('Los conceptos del sistema son el tratamiento de ley: no se eliminan.')
    }
    const usos = await prisma.novedadConcepto.count({ where: { conceptoId: id } })
    if (usos > 0) {
      throw new ErrorNegocio(
        `«${c.nombre}» ya se aplicó a ${usos} colaborador(es) en nómina y no se puede eliminar: los desprendibles dejarían de cuadrar. Desactívalo para que no vuelva a usarse.`,
      )
    }
    await dbAuditado.conceptoNomina.delete({ where: { id } })
    revalidatePath(RUTA_CONCEPTOS)
    return { ok: true }
  },
)
