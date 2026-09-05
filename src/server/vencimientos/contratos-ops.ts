import 'server-only'
import { prisma } from '@/lib/db'
import { hoyBogota, formatFechaISO } from '@/lib/fechas'
import { publicarVencimiento } from '@/server/vencimientos/servicio'

/**
 * Publica el vencimiento de los contratos OPS vigentes que todavía no lo tienen.
 *
 * Los OPS estuvieron fuera del sistema de vencimientos desde el principio, así
 * que los que ya estaban creados no alertarían nunca: publicar corre al crear o
 * editar, y a esos contratos nadie los va a volver a tocar. Sin este relleno,
 * arreglar el código solo serviría para los contratos futuros.
 *
 * Corre en el cron diario y es idempotente por partida doble: solo mira los que
 * NO tienen vencimiento publicado, y `publicarVencimiento` es un upsert. Así
 * tampoco reabre uno que alguien haya resuelto a mano.
 *
 * Se ignoran los que ya vencieron: publicarles un vencimiento pasado dispararía
 * de golpe las tres alertas por algo que ya no se puede prevenir, y de esos ya
 * se encarga el recordatorio semanal de «vencido sin cerrar».
 */
export async function publicarVencimientosOpsFaltantes(): Promise<{ publicados: number }> {
  const hoy = hoyBogota()

  const candidatos = await prisma.contratoOps.findMany({
    where: { estado: { in: ['ACTIVO', 'FIRMADO'] }, fechaFin: { gte: hoy } },
    select: {
      id: true, numero: true, objeto: true, sedeId: true, fechaFin: true,
      colaborador: { select: { nombres: true, apellidos: true } },
    },
  })
  if (candidatos.length === 0) return { publicados: 0 }

  const yaPublicados = await prisma.vencimiento.findMany({
    where: {
      entidadTipo: 'ContratoOps',
      origen: 'CONTRATO_OPS',
      entidadId: { in: candidatos.map((c) => c.id) },
    },
    select: { entidadId: true },
  })
  const conocidos = new Set(yaPublicados.map((v) => v.entidadId))

  let publicados = 0
  for (const c of candidatos) {
    if (conocidos.has(c.id)) continue
    const persona = c.colaborador
      ? `${c.colaborador.nombres} ${c.colaborador.apellidos}`
      : 'contratista sin ficha'
    await publicarVencimiento({
      origen: 'CONTRATO_OPS',
      entidadTipo: 'ContratoOps',
      entidadId: c.id,
      titulo: `Vence contrato OPS ${c.numero} — ${persona}`,
      detalle: c.objeto,
      fechaVencimientoISO: formatFechaISO(c.fechaFin!),
      sedeId: c.sedeId,
    })
    publicados++
  }
  return { publicados }
}
