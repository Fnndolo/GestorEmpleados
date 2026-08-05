import { NextResponse, after, type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { ejecutarConContexto } from '@/server/contexto'
import { dividirDiurnoNocturno, PAREJA_TIPO_HORA } from '@/server/nomina/horas'
import { liquidarPeriodo } from '@/server/nomina/liquidador'
import { parseFechaISO } from '@/lib/fechas'

/**
 * Recepción de horas con recargo desde el sistema de asistencia (ArriveControl).
 * Contrato: docs/integraciones/asistencia-horas.md
 *
 * Principio: el sistema de asistencia decide QUÉ horas son extra; esta plataforma
 * decide CÓMO se clasifican (corte diurno/nocturno a las 7:00 p.m., Ley 2466) y
 * las liquida. Aquí no entra dinero ni factores: solo horas.
 *
 * Idempotente por (referenciaExterna, tipoHora): reenviar el mismo lote no vuelve
 * a pagar las horas, solo las cuenta como duplicadas.
 */

export const runtime = 'nodejs'
export const maxDuration = 60

const registroSchema = z.object({
  documento: z.string().trim().min(3).max(20),
  tipoDocumento: z.enum(['CC', 'CE', 'TI', 'PASAPORTE', 'PPT', 'NIT']).default('CC'),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha AAAA-MM-DD'),
  horaInicio: z.string().regex(/^\d{2}:\d{2}$/, 'Formato de hora HH:MM'),
  horaFin: z.string().regex(/^\d{2}:\d{2}$/, 'Formato de hora HH:MM'),
  tipoHora: z.enum(['HED', 'HEN', 'RN', 'RD', 'RND', 'HEDD', 'HEND']),
  horas: z.coerce.number().min(0.5).max(12),
  referenciaExterna: z.string().trim().min(1).max(120),
  observaciones: z.string().trim().max(500).optional(),
})

const loteSchema = z.object({
  registros: z.array(registroSchema).max(500).default([]),
  // Referencias externas de turnos ELIMINADOS en el origen: sus novedades se
  // borran aquí (si el periodo sigue abierto).
  anulaciones: z.array(z.string().trim().min(1).max(120)).max(500).default([]),
}).refine((l) => l.registros.length + l.anulaciones.length > 0, {
  message: 'El lote debe traer al menos un registro o una anulación.',
})

type Rechazo = { referenciaExterna: string; motivo: string; detalle: string }

/** El periodo ya liquidado no admite novedades: entra como ajuste manual. */
const ESTADOS_CERRADOS = new Set(['CERRADA', 'PAGADA'])

export async function POST(req: NextRequest) {
  // Autenticación por clave compartida. En producción es obligatoria; en
  // desarrollo se permite sin clave para poder probar contra la base local.
  const clave = process.env.INTEGRACION_HORAS_API_KEY
  const enviada = req.headers.get('x-api-key')
  if (process.env.NODE_ENV === 'production' || clave) {
    if (!clave || enviada !== clave) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
    }
  }

  let cuerpo: unknown
  try {
    cuerpo = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = loteSchema.safeParse(cuerpo)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Lote inválido', detalle: z.treeifyError(parsed.error) },
      { status: 400 },
    )
  }

  const { registros, anulaciones } = parsed.data
  const rechazados: Rechazo[] = []
  let aplicados = 0
  let duplicados = 0
  let reemplazados = 0
  let anulados = 0
  // Periodos cuyas novedades cambiaron: si ya estaban liquidados (CALCULADA),
  // se recalculan al final para que la nómina refleje el cambio.
  const periodosAfectados = new Set<string>()

  // Cachés por lote: un lote típico repite pocas cédulas y pocos periodos.
  const colaboradores = new Map<string, { id: string; estado: string } | null>()
  const periodos = new Map<string, { id: string; estado: string; nombre: string } | null>()

  // La auditoría necesita un actor. No hay sesión: se identifica la integración.
  await ejecutarConContexto(
    { userId: null, userEmail: 'integracion:asistencia', ip: req.headers.get('x-forwarded-for') },
    async () => {
      // ── Anulaciones: turnos eliminados en el origen ──
      for (const ref of anulaciones) {
        const filas = await prisma.novedadHoras.findMany({
          where: { referenciaExterna: ref },
          select: { id: true, periodoId: true, periodo: { select: { estado: true, nombre: true } } },
        })
        if (filas.length === 0) {
          // Ya no existe (o nunca llegó): anular dos veces no es un error.
          continue
        }
        const cerrada = filas.find((f) => f.periodo && ESTADOS_CERRADOS.has(f.periodo.estado))
        if (cerrada) {
          rechazados.push({
            referenciaExterna: ref,
            motivo: 'PERIODO_CERRADO',
            detalle: `No se puede anular: el periodo ${cerrada.periodo!.nombre} ya está ${cerrada.periodo!.estado.toLowerCase()}.`,
          })
          continue
        }
        await dbAuditado.novedadHoras.deleteMany({ where: { referenciaExterna: ref } })
        anulados++
        for (const f of filas) if (f.periodoId) periodosAfectados.add(f.periodoId)
      }

      for (const r of registros) {
        const claveColab = `${r.tipoDocumento}:${r.documento}`
        if (!colaboradores.has(claveColab)) {
          colaboradores.set(
            claveColab,
            await prisma.colaborador.findUnique({
              where: { tipoDocumento_numeroDocumento: { tipoDocumento: r.tipoDocumento, numeroDocumento: r.documento } },
              select: { id: true, estado: true },
            }),
          )
        }
        const colaborador = colaboradores.get(claveColab)
        if (!colaborador || colaborador.estado === 'RETIRADO') {
          rechazados.push({
            referenciaExterna: r.referenciaExterna,
            motivo: 'COLABORADOR_NO_ENCONTRADO',
            detalle: `No hay colaborador activo con ${r.tipoDocumento} ${r.documento}.`,
          })
          continue
        }

        const fecha = parseFechaISO(r.fecha)
        if (!fecha) {
          rechazados.push({ referenciaExterna: r.referenciaExterna, motivo: 'DATOS_INVALIDOS', detalle: `Fecha inválida: ${r.fecha}.` })
          continue
        }

        if (!periodos.has(r.fecha)) {
          periodos.set(
            r.fecha,
            await prisma.periodoNomina.findFirst({
              where: { fechaInicio: { lte: fecha }, fechaFin: { gte: fecha }, esAjuste: false },
              select: { id: true, estado: true, nombre: true },
              orderBy: { creadoEn: 'desc' },
            }),
          )
        }
        const periodo = periodos.get(r.fecha)
        if (!periodo) {
          rechazados.push({
            referenciaExterna: r.referenciaExterna,
            motivo: 'PERIODO_NO_ENCONTRADO',
            detalle: `No hay periodo de nómina que cubra el ${r.fecha}.`,
          })
          continue
        }
        if (ESTADOS_CERRADOS.has(periodo.estado)) {
          rechazados.push({
            referenciaExterna: r.referenciaExterna,
            motivo: 'PERIODO_CERRADO',
            detalle: `El periodo de nómina ${periodo.nombre} ya está ${periodo.estado.toLowerCase()}.`,
          })
          continue
        }

        // ── Turno EDITADO en el origen ──
        // El origen incluye el rango horario en la referencia, así que una
        // edición llega con referencia NUEVA y la fila vieja quedaría pagando
        // doble. Regla: un registro entrante REEMPLAZA las novedades de
        // integración (referenciaExterna no nula) del mismo colaborador y fecha
        // cuyo rango horario se solape con el suyo. Las digitadas a mano
        // (sin referencia) no se tocan.
        const solapadas = await prisma.novedadHoras.findMany({
          where: {
            colaboradorId: colaborador.id,
            fecha,
            referenciaExterna: { not: null },
            NOT: { referenciaExterna: r.referenciaExterna },
            horaInicio: { lt: r.horaFin },
            horaFin: { gt: r.horaInicio },
          },
          select: { id: true, periodoId: true },
        })
        if (solapadas.length > 0) {
          await dbAuditado.novedadHoras.deleteMany({ where: { id: { in: solapadas.map((s) => s.id) } } })
          reemplazados += solapadas.length
          for (const s of solapadas) if (s.periodoId) periodosAfectados.add(s.periodoId)
        }

        // Clasificación por franja: un rango que cruza las 7:00 p.m. se parte en
        // dos novedades (diurna y nocturna) que comparten la referencia externa.
        const { diurnas, nocturnas } = dividirDiurnoNocturno(r.horaInicio, r.horaFin)
        const pareja = PAREJA_TIPO_HORA[r.tipoHora]
        const tramos = [
          ...(diurnas > 0 && pareja.diurno ? [{ tipoHora: pareja.diurno, horas: diurnas }] : []),
          ...(nocturnas > 0 ? [{ tipoHora: pareja.nocturno, horas: nocturnas }] : []),
        ]
        if (tramos.length === 0) {
          rechazados.push({
            referenciaExterna: r.referenciaExterna,
            motivo: 'DATOS_INVALIDOS',
            detalle: 'El rango indicado no genera horas con recargo (la hora ordinaria diurna no tiene recargo).',
          })
          continue
        }

        let algunoAplicado = false
        let algunoDuplicado = false
        for (const t of tramos) {
          // Segunda barrera contra duplicados: el índice único protege de un
          // reenvío con la MISMA referencia, pero no de un cambio de formato en
          // el origen (ocurrió: la referencia pasó de usar el id interno a la
          // cédula y se reinsertó todo). Un mismo colaborador no puede tener dos
          // veces el mismo tramo —fecha, rango horario y tipo—, venga de donde
          // venga la referencia.
          const equivalente = await prisma.novedadHoras.findFirst({
            where: {
              colaboradorId: colaborador.id,
              fecha,
              horaInicio: r.horaInicio,
              horaFin: r.horaFin,
              tipoHora: t.tipoHora,
            },
            select: { id: true },
          })
          if (equivalente) {
            algunoDuplicado = true
            continue
          }
          try {
            await dbAuditado.novedadHoras.create({
              data: {
                colaboradorId: colaborador.id,
                periodoId: periodo.id,
                fecha,
                tipoHora: t.tipoHora,
                horas: t.horas,
                horaInicio: r.horaInicio,
                horaFin: r.horaFin,
                referenciaExterna: r.referenciaExterna,
                observaciones: r.observaciones ?? 'Importada del sistema de asistencia.',
              },
            })
            algunoAplicado = true
          } catch (e) {
            // P2002 = choque del índice único (referencia_externa, tipo_hora):
            // es un reenvío del mismo tramo, no un error (contrato §4.1).
            if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2002') {
              algunoDuplicado = true
              continue
            }
            throw e
          }
        }
        if (algunoAplicado) {
          aplicados++
          periodosAfectados.add(periodo.id)
        } else if (algunoDuplicado) duplicados++
      }
    },
  )

  // ── Recalcular la nómina afectada ──
  // Solo periodos ya liquidados (CALCULADA): en BORRADOR aún no hay liquidación
  // que actualizar, y uno APROBADO no se recalcula a espaldas de quien lo aprobó
  // (se informa para que lo reabra y liquide manualmente).
  // La reliquidación corre DESPUÉS de responder (after): su costo crece con el
  // número de empleados, no con el lote, y no debe hacer esperar al que envía.
  const periodosRecalculando: string[] = []
  const periodosSinRecalcular: string[] = []
  const recalcularIds: string[] = []
  for (const periodoId of periodosAfectados) {
    const p = await prisma.periodoNomina.findUnique({ where: { id: periodoId }, select: { nombre: true, estado: true } })
    if (!p) continue
    if (p.estado === 'CALCULADA') {
      recalcularIds.push(periodoId)
      periodosRecalculando.push(p.nombre)
    } else if (p.estado === 'APROBADA') {
      periodosSinRecalcular.push(`${p.nombre} (aprobado: reabrir y liquidar de nuevo)`)
    }
  }
  if (recalcularIds.length > 0) {
    const ip = req.headers.get('x-forwarded-for')
    after(async () => {
      for (const periodoId of recalcularIds) {
        try {
          await ejecutarConContexto(
            { userId: null, userEmail: 'integracion:asistencia', ip },
            () => liquidarPeriodo(periodoId),
          )
        } catch (e) {
          console.error(`[integracion:horas] Falló la reliquidación del periodo ${periodoId}:`, e)
        }
      }
    })
  }

  return NextResponse.json({
    ok: true,
    recibidos: registros.length,
    aplicados,
    duplicados,
    reemplazados,
    anulados,
    rechazados,
    periodosRecalculando,
    periodosSinRecalcular,
  })
}
