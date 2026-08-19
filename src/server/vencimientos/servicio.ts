import 'server-only'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { cargarFestivos } from '@/server/vencimientos/festivos'
import { fechaAlerta } from '@/lib/dias-habiles'
import { parseFechaISO, formatFechaISO } from '@/lib/fechas'
import type { OrigenVencimiento } from '@/generated/prisma/enums'

type ResponsableInput = { userId?: string; rol?: string; esPrincipal?: boolean }

export type PublicarVencimientoParams = {
  origen: OrigenVencimiento
  entidadTipo: string
  entidadId: string
  titulo: string
  detalle?: string | null
  fechaVencimientoISO: string // yyyy-mm-dd
  sedeId?: string | null
  responsables?: ResponsableInput[]
}

/** Regla de alerta aplicable a un origen (cae a GLOBAL si no hay específica). */
async function resolverRegla(origen: OrigenVencimiento) {
  const especifica = await prisma.reglaAlerta.findUnique({ where: { clave: origen } })
  if (especifica) return especifica
  const global = await prisma.reglaAlerta.findUnique({ where: { clave: 'GLOBAL' } })
  if (global) return global
  // Fallback en código si el seed no se ha corrido
  return {
    diasPrimeraAlerta: 10, primeraEnHabiles: true,
    diasUltimaAlerta: 3, ultimaEnHabiles: true,
  }
}

async function sabadoHabil(): Promise<boolean> {
  const empresa = await prisma.configuracionEmpresa.findFirst()
  return empresa?.sabadoHabil ?? true
}

/**
 * Publica (o actualiza) un vencimiento para una entidad y materializa sus pasos
 * de alerta. Idempotente: una sola fila activa por (entidadTipo, entidadId, origen).
 */
export async function publicarVencimiento(params: PublicarVencimientoParams) {
  const regla = await resolverRegla(params.origen)
  const sabHabil = await sabadoHabil()
  const anio = Number(params.fechaVencimientoISO.slice(0, 4))
  const festivos = await cargarFestivos(anio - 1, anio + 1)

  const fechaVenc = parseFechaISO(params.fechaVencimientoISO)!
  const fechaPrimera = parseFechaISO(
    fechaAlerta(params.fechaVencimientoISO, regla.diasPrimeraAlerta, regla.primeraEnHabiles, festivos, sabHabil),
  )!
  const fechaUltima = parseFechaISO(
    fechaAlerta(params.fechaVencimientoISO, regla.diasUltimaAlerta, regla.ultimaEnHabiles, festivos, sabHabil),
  )!

  const venc = await dbAuditado.vencimiento.upsert({
    where: {
      entidadTipo_entidadId_origen: {
        entidadTipo: params.entidadTipo,
        entidadId: params.entidadId,
        origen: params.origen,
      },
    },
    create: {
      origen: params.origen,
      entidadTipo: params.entidadTipo,
      entidadId: params.entidadId,
      titulo: params.titulo,
      detalle: params.detalle ?? null,
      fechaVencimiento: fechaVenc,
      sedeId: params.sedeId ?? null,
      estado: 'PENDIENTE',
    },
    update: {
      titulo: params.titulo,
      detalle: params.detalle ?? null,
      fechaVencimiento: fechaVenc,
      sedeId: params.sedeId ?? null,
      // Si cambió la fecha, reactivar para que vuelva a alertar
      estado: 'PENDIENTE',
      resueltoEn: null,
    },
  })

  // Responsables: reemplazar
  if (params.responsables) {
    await prisma.responsableVencimiento.deleteMany({ where: { vencimientoId: venc.id } })
    if (params.responsables.length) {
      await prisma.responsableVencimiento.createMany({
        data: params.responsables.map((r) => ({
          vencimientoId: venc.id,
          userId: r.userId ?? null,
          rol: r.rol ?? null,
          esPrincipal: r.esPrincipal ?? true,
        })),
      })
    }
  }

  // Materializar pasos: borrar los no despachados y recrear (los despachados quedan)
  await prisma.alertaVencimiento.deleteMany({ where: { vencimientoId: venc.id, despachada: false } })
  const pasos = [
    { paso: 'PRIMERA' as const, fecha: fechaPrimera },
    { paso: 'ULTIMA' as const, fecha: fechaUltima },
    { paso: 'VENCIDO' as const, fecha: fechaVenc },
  ]
  for (const p of pasos) {
    const existe = await prisma.alertaVencimiento.findUnique({
      where: { vencimientoId_paso: { vencimientoId: venc.id, paso: p.paso } },
    })
    if (!existe) {
      await prisma.alertaVencimiento.create({
        data: { vencimientoId: venc.id, paso: p.paso, fechaProgramada: p.fecha },
      })
    }
  }

  return venc
}

/** Marca un vencimiento como resuelto (deja de alertar). */
/**
 * Reaplica una regla a los vencimientos que YA estaban publicados.
 *
 * Cambiar la regla solo afecta a lo que se publique después: los pasos de
 * alerta se materializan al publicar. Sin esto, poner los contratos fijos en
 * 40 días no movería ni una sola alerta de los contratos vigentes, que es
 * justo lo que se quiere lograr al cambiarla.
 *
 * Los pasos ya despachados no se tocan: un aviso enviado no se reescribe.
 * Devuelve cuántos vencimientos quedaron reprogramados.
 */
export async function reaplicarReglaAlerta(clave: string): Promise<number> {
  // La regla GLOBAL alcanza a todo origen que no tenga la suya propia.
  let origenes: OrigenVencimiento[]
  if (clave === 'GLOBAL') {
    const propias = await prisma.reglaAlerta.findMany({ where: { clave: { not: 'GLOBAL' } }, select: { clave: true } })
    const conReglaPropia = new Set(propias.map((r) => r.clave))
    const usados = await prisma.vencimiento.findMany({ where: { estado: 'PENDIENTE' }, select: { origen: true }, distinct: ['origen'] })
    origenes = usados.map((u) => u.origen).filter((o) => !conReglaPropia.has(o))
  } else {
    origenes = [clave as OrigenVencimiento]
  }
  if (origenes.length === 0) return 0

  const vencimientos = await prisma.vencimiento.findMany({
    where: { origen: { in: origenes }, estado: 'PENDIENTE' },
    include: { alertas: true },
  })
  if (vencimientos.length === 0) return 0

  const sabHabil = await sabadoHabil()
  const anios = vencimientos.map((v) => v.fechaVencimiento.getUTCFullYear())
  const festivos = await cargarFestivos(Math.min(...anios) - 1, Math.max(...anios) + 1)

  let reprogramados = 0
  for (const v of vencimientos) {
    const regla = await resolverRegla(v.origen)
    const iso = formatFechaISO(v.fechaVencimiento)
    const nuevas: Record<'PRIMERA' | 'ULTIMA', Date> = {
      PRIMERA: parseFechaISO(fechaAlerta(iso, regla.diasPrimeraAlerta, regla.primeraEnHabiles, festivos, sabHabil))!,
      ULTIMA: parseFechaISO(fechaAlerta(iso, regla.diasUltimaAlerta, regla.ultimaEnHabiles, festivos, sabHabil))!,
    }
    let tocado = false
    for (const paso of ['PRIMERA', 'ULTIMA'] as const) {
      const actual = v.alertas.find((a) => a.paso === paso)
      if (actual?.despachada) continue
      const fecha = nuevas[paso]
      if (actual) {
        if (actual.fechaProgramada.getTime() === fecha.getTime()) continue
        await prisma.alertaVencimiento.update({ where: { id: actual.id }, data: { fechaProgramada: fecha } })
      } else {
        await prisma.alertaVencimiento.create({ data: { vencimientoId: v.id, paso, fechaProgramada: fecha } })
      }
      tocado = true
    }
    if (tocado) reprogramados++
  }
  return reprogramados
}

export async function resolverVencimiento(entidadTipo: string, entidadId: string, origen: OrigenVencimiento) {
  const venc = await prisma.vencimiento.findUnique({
    where: { entidadTipo_entidadId_origen: { entidadTipo, entidadId, origen } },
  })
  if (!venc) return
  await dbAuditado.vencimiento.update({
    where: { id: venc.id },
    data: { estado: 'RESUELTO', resueltoEn: new Date() },
  })
  await prisma.alertaVencimiento.deleteMany({ where: { vencimientoId: venc.id, despachada: false } })
}

/** Cancela (elimina) un vencimiento, p. ej. si la entidad fuente se borra. */
export async function cancelarVencimiento(entidadTipo: string, entidadId: string, origen?: OrigenVencimiento) {
  await prisma.vencimiento.deleteMany({
    where: { entidadTipo, entidadId, ...(origen ? { origen } : {}) },
  })
}

export { formatFechaISO }
