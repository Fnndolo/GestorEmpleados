'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { dbAuditado, auditar } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'
import { hoyBogotaISO } from '@/lib/fechas'
import {
  ASISTENCIA_URL_DEFECTO, CODIGOS_ASISTENCIA, ErrorAsistencia, normalizarCedula, rangoDePeriodo, resumenAsistencia,
} from '@/server/asistencia/cliente'
import { sincronizarHorasAsistencia } from '@/server/asistencia/horas-asistencia'

/**
 * Lo que la pantalla de Horas extra le pide a AsistencIA: ver el período,
 * traerlo como novedades y conectar/desconectar la clave.
 */

const periodoSchema = z.object({
  mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Indica el mes como AAAA-MM.'),
  quincena: z.union([z.literal(1), z.literal(2)]).nullable(),
})

/** Una persona en la tabla de la pantalla: lo de AsistencIA cruzado con la ficha de aquí. */
export type FilaAsistencia = {
  documento: string
  nombre: string
  sede: string | null
  /** Ficha de esta plataforma; null si la cédula no existe aquí (o está retirada). */
  colaboradorId: string | null
  horas: Record<string, number>
  horasExtra: number
  /** Pesos según el salario que tiene en AsistencIA; null si allá no lo tiene. */
  valor: number | null
  pago: 'pagado' | 'pendiente' | 'parcial'
  /** Tramos del período y cuántos ya están registrados aquí como novedad. */
  tramos: number
  registrados: number
  /** Periodos de nómina de aquí que ya recogieron alguno de sus tramos. */
  periodos: string[]
}

export type ResumenPantalla = {
  desde: string
  hasta: string
  totales: { horas: Record<string, number>; horasExtra: number; valor: number; sinSalario: number }
  filas: FilaAsistencia[]
  sinFicha: number
}

const traducir = (e: unknown): never => {
  if (e instanceof ErrorAsistencia) throw new ErrorNegocio(e.message)
  throw e
}

/** Las horas del período tal como las reporta AsistencIA, cruzadas con las fichas. */
export const consultarHorasAsistencia = accion(
  { modulo: 'nomina', accion: 'CREAR', schema: periodoSchema },
  async (d): Promise<ResumenPantalla> => {
    const r = await resumenAsistencia({ mes: d.mes, quincena: d.quincena }).catch(traducir)

    const fichas = await prisma.colaborador.findMany({ select: { id: true, nombres: true, apellidos: true, numeroDocumento: true, estado: true } })
    const porCedula = new Map(fichas.map((c) => [normalizarCedula(c.numeroDocumento), c]))

    // Qué tramos ya están aquí y en qué periodo cayeron.
    const referencias = r.empleados.flatMap((e) => e.referencias)
    const existentes = referencias.length
      ? await prisma.novedadHoras.findMany({
          where: { referenciaExterna: { in: referencias } },
          select: { referenciaExterna: true, periodo: { select: { nombre: true } } },
        })
      : []
    const registrada = new Map<string, string | null>()
    for (const x of existentes) registrada.set(x.referenciaExterna!, x.periodo?.nombre ?? null)

    const filas: FilaAsistencia[] = r.empleados.map((e) => {
      const ficha = porCedula.get(normalizarCedula(e.documento))
      const activa = ficha && ficha.estado !== 'RETIRADO' ? ficha : null
      const periodos = [...new Set(e.referencias.map((ref) => registrada.get(ref)).filter((p): p is string => Boolean(p)))]
      return {
        documento: e.documento,
        nombre: activa ? `${activa.nombres} ${activa.apellidos}` : (e.nombre ?? e.documento),
        sede: e.sede,
        colaboradorId: activa?.id ?? null,
        horas: Object.fromEntries(CODIGOS_ASISTENCIA.map((c) => [c, e.horas[c] ?? 0])),
        horasExtra: e.horasExtra,
        valor: e.valor,
        pago: e.pago,
        tramos: e.referencias.length,
        registrados: e.referencias.filter((ref) => registrada.has(ref)).length,
        periodos,
      }
    })

    return {
      desde: r.desde,
      hasta: r.hasta,
      totales: { horas: r.totales.horas, horasExtra: r.totales.horasExtra, valor: r.totales.valor, sinSalario: r.totales.sinSalario },
      filas,
      sinFicha: filas.filter((f) => !f.colaboradorId).length,
    }
  },
)

/**
 * Registra como novedades pendientes las horas del período que AsistencIA
 * reporta. Idempotente: lo ya registrado (o ya pagado) no se duplica.
 */
export const traerHorasAsistencia = accion(
  { modulo: 'nomina', accion: 'CREAR', schema: periodoSchema },
  async (d) => {
    const rango = rangoDePeriodo(d.mes, d.quincena)
    const r = await sincronizarHorasAsistencia(rango).catch(traducir)
    await auditar('CREAR', 'NovedadHoras', {
      descripcion: `Horas de AsistencIA ${rango.desde} a ${rango.hasta}: ${r.creadas} nuevas, ${r.yaEstaban} ya registradas, ${r.quitadas} retiradas`,
    })
    revalidatePath('/nomina/novedades')
    return r
  },
)

/**
 * Guarda la clave de API de la empresa. Se prueba ANTES de guardarla, pidiendo
 * el resumen del mes en curso: una clave mal pegada se rechaza aquí mismo, no
 * el día del cierre de nómina.
 */
export const conectarAsistencia = accion(
  {
    modulo: 'configuracion',
    accion: 'EDITAR',
    schema: z.object({
      clave: z.string().trim().min(8, 'Pega la clave completa.').max(500),
      url: z.string().trim().url('La dirección debe empezar por https://').optional().or(z.literal('')),
    }),
  },
  async (d) => {
    const url = (d.url || ASISTENCIA_URL_DEFECTO).replace(/\/+$/, '')
    await resumenAsistencia({ mes: hoyBogotaISO().slice(0, 7) }, { url, clave: d.clave }).catch(traducir)

    const actual = await prisma.configuracionEmpresa.findFirst()
    if (!actual) throw new ErrorNegocio('Configura primero los datos de la empresa en Ajustes → Empresa.')
    await dbAuditado.configuracionEmpresa.update({
      where: { id: actual.id },
      data: { asistenciaApiKey: d.clave, asistenciaUrl: d.url || null },
    })
    revalidatePath('/nomina/novedades')
    return { ok: true }
  },
)

export const desconectarAsistencia = accion(
  { modulo: 'configuracion', accion: 'EDITAR' },
  async () => {
    const actual = await prisma.configuracionEmpresa.findFirst()
    if (actual?.asistenciaApiKey) {
      await dbAuditado.configuracionEmpresa.update({ where: { id: actual.id }, data: { asistenciaApiKey: null, asistenciaUrl: null } })
    }
    revalidatePath('/nomina/novedades')
    return { ok: true }
  },
)
