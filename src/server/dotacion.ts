import 'server-only'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { subirArchivo } from '@/server/storage'
import { renderActaDotacion } from '@/server/pdf/acta-dotacion'
import { hoyBogota } from '@/lib/fechas'
import { notificarUsuario } from '@/server/notificaciones/avisar'

/**
 * Genera (o regenera con firma) el PDF del recibido de dotación (arts. 230-234
 * CST) y lo guarda en el expediente del colaborador, actualizando el puntero
 * de la entrega. Devuelve el id del documento.
 */
export async function generarRecibidoDotacion(
  entregaId: string,
  usuarioId: string,
  firma?: { dataUri: string; fecha: Date },
): Promise<string> {
  const entrega = await prisma.entregaDotacion.findUniqueOrThrow({
    where: { id: entregaId },
    include: { colaborador: { include: { cargo: true, sede: { include: { ciudad: true } } } } },
  })
  const empresa = await prisma.configuracionEmpresa.findFirstOrThrow()
  const colab = entrega.colaborador

  const pdf = await renderActaDotacion({
    empresa: {
      razonSocial: empresa.razonSocial, nombreComercial: empresa.nombreComercial, nit: empresa.nit,
      direccion: empresa.direccion, telefono: empresa.telefono, emailContacto: empresa.emailContacto,
    },
    colaborador: { nombre: `${colab.nombres} ${colab.apellidos}`, documento: colab.numeroDocumento, cargo: colab.cargo?.nombre ?? null },
    anio: entrega.anio,
    corte: entrega.corte,
    items: entrega.items,
    ciudad: colab.sede.ciudad.nombre,
    fecha: entrega.fechaEntrega,
    firmaDataUri: firma?.dataUri ?? null,
    firmaFecha: firma?.fecha ?? null,
  })

  const archivo = await subirArchivo(`dotacion/${entrega.colaboradorId}`, `recibido-${entrega.anio}-${entrega.corte.toLowerCase()}${firma ? '-firmado' : ''}.pdf`, pdf, 'application/pdf')
  const doc = await prisma.documento.create({
    data: {
      entidadTipo: 'Colaborador', entidadId: entrega.colaboradorId,
      nombre: `Recibido de dotación ${entrega.corte} ${entrega.anio}${firma ? ' (firmado)' : ''}`,
      bucket: archivo.bucket, storagePath: archivo.storagePath, mimeType: 'application/pdf',
      tamanoBytes: archivo.tamanoBytes, nivelAcceso: 'GENERAL', sedeId: colab.sedeId, subidoPorId: usuarioId,
    },
  })
  await dbAuditado.entregaDotacion.update({
    where: { id: entregaId },
    data: { recibidoDocId: doc.id, ...(firma ? { firmadoEn: firma.fecha } : {}) },
  })
  return doc.id
}

/** Fechas límite de ley por corte (arts. 230/232 CST). */
const CORTES: { corte: 'Abril' | 'Agosto' | 'Diciembre'; mes: number; dia: number }[] = [
  { corte: 'Abril', mes: 4, dia: 30 },
  { corte: 'Agosto', mes: 8, dia: 31 },
  { corte: 'Diciembre', mes: 12, dia: 20 },
]
const DIAS_ANTICIPACION = 15

/**
 * Alerta de cortes de dotación (cron diario): dentro de los 15 días previos a
 * cada fecha límite, avisa a RRHH cuántos colaboradores con derecho a dotación
 * (activos, con contrato laboral y salario ≤ 2 SMMLV — art. 230 CST) aún no
 * tienen entrega registrada en ese corte. Idempotente por (año, corte) vía dedupeKey.
 */
export async function alertarCortesDotacion(): Promise<{ corte: string | null; sinEntrega: number }> {
  const hoy = hoyBogota()
  const anio = hoy.getUTCFullYear()

  const proximo = CORTES.find((c) => {
    const limite = new Date(Date.UTC(anio, c.mes - 1, c.dia))
    const inicioVentana = new Date(limite)
    inicioVentana.setUTCDate(inicioVentana.getUTCDate() - DIAS_ANTICIPACION)
    return hoy >= inicioVentana && hoy <= limite
  })
  if (!proximo) return { corte: null, sinEntrega: 0 }

  const smmlv = await prisma.parametroLegal.findFirst({
    where: { clave: 'SMMLV', vigenciaDesde: { lte: hoy }, OR: [{ vigenciaHasta: null }, { vigenciaHasta: { gte: hoy } }] },
    orderBy: { vigenciaDesde: 'desc' },
  })
  const tope = smmlv ? Number(smmlv.valor) * 2 : null

  // Con derecho: contrato laboral activo y salario ≤ 2 SMMLV (o gana el mínimo).
  const contratos = await prisma.contrato.findMany({
    where: {
      estado: 'ACTIVO',
      tipo: { in: ['TERMINO_FIJO', 'TERMINO_INDEFINIDO', 'OBRA_LABOR'] },
      colaborador: { estado: 'ACTIVO' },
    },
    select: { colaboradorId: true, salarioBase: true, ganaSalarioMinimo: true },
  })
  const conDerecho = contratos
    .filter((c) => c.ganaSalarioMinimo || tope === null || Number(c.salarioBase) <= tope)
    .map((c) => c.colaboradorId)

  const entregados = await prisma.entregaDotacion.findMany({
    where: { anio, corte: proximo.corte, colaboradorId: { in: conDerecho } },
    select: { colaboradorId: true },
  })
  const yaTienen = new Set(entregados.map((e) => e.colaboradorId))
  const sinEntrega = conDerecho.filter((id) => !yaTienen.has(id)).length
  if (sinEntrega === 0) return { corte: proximo.corte, sinEntrega: 0 }

  const rrhh = await prisma.user.findMany({
    where: { estado: 'ACTIVO', rol: { nombre: { in: ['Recursos Humanos', 'Administrador'] } } },
    select: { id: true },
  })
  for (const u of rrhh) {
    // dedupeKey por (usuario, año, corte): la alerta llega una sola vez por corte.
    await notificarUsuario(
      u.id,
      `Dotación ${proximo.corte} ${anio}: entregas pendientes`,
      `${sinEntrega} colaborador(es) con derecho a dotación (salario ≤ 2 SMMLV) aún no tienen registrada la entrega del corte de ${proximo.corte} (límite ${proximo.dia} de ${proximo.corte.toLowerCase()}, arts. 230-232 CST).`,
      '/activos?tab=dotacion',
      `dotacion:${anio}:${proximo.corte}:${u.id}`,
      'dotacion_corte',
    )
  }
  return { corte: proximo.corte, sinEntrega }
}

const DIAS_PLAZO_INDUCCION = 15

/**
 * Alerta de inducción pendiente (cron diario): colaboradores activos con más de
 * 15 días desde su ingreso y sin asistencia registrada a una capacitación de
 * tipo INDUCCION (RIT arts. 7 y 95: la inducción es obligatoria al vincularse).
 * Idempotente por colaborador vía dedupeKey.
 */
export async function alertarInduccionPendiente(): Promise<{ sinInduccion: number }> {
  const limite = hoyBogota()
  limite.setUTCDate(limite.getUTCDate() - DIAS_PLAZO_INDUCCION)

  const sinInduccion = await prisma.colaborador.findMany({
    where: {
      estado: 'ACTIVO',
      fechaIngreso: { lte: limite },
      asistencias: { none: { capacitacion: { tipo: 'INDUCCION' } } },
    },
    select: { id: true, nombres: true, apellidos: true },
  })
  if (sinInduccion.length === 0) return { sinInduccion: 0 }

  const rrhh = await prisma.user.findMany({
    where: { estado: 'ACTIVO', rol: { nombre: { in: ['Recursos Humanos', 'Administrador'] } } },
    select: { id: true },
  })
  const nombres = sinInduccion.slice(0, 5).map((c) => `${c.nombres} ${c.apellidos}`).join(', ')
  for (const u of rrhh) {
    for (const c of sinInduccion) {
      await notificarUsuario(
        u.id,
        'Inducción pendiente',
        `${sinInduccion.length} colaborador(es) con más de ${DIAS_PLAZO_INDUCCION} días de ingreso no tienen inducción registrada (RIT arts. 7 y 95): ${nombres}${sinInduccion.length > 5 ? '…' : ''}.`,
        '/capacitaciones',
        `induccion:${c.id}:${u.id}`,
        'induccion_pendiente',
      )
    }
  }
  return { sinInduccion: sinInduccion.length }
}
