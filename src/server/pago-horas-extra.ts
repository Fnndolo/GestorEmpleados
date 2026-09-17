import 'server-only'
import { createHash } from 'node:crypto'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { ErrorNegocio } from '@/server/accion'
import { subirArchivo } from '@/server/storage'
import { eliminarDocumento } from '@/server/documentos'
import { fondoMembrete } from '@/server/pdf/fondo-membrete'
import { renderOrdenPagoHorasExtra } from '@/server/pdf/pago-horas-extra'
import { resumenAsistencia, normalizarCedula, rangoDePeriodo, CODIGOS_ASISTENCIA } from '@/server/asistencia/cliente'
import { parseFechaISO } from '@/lib/fechas'

/**
 * Pago de horas extra APARTE de la nómina (decisión de esta empresa, no un caso
 * general de la plataforma): lleva su propio estado, persona por persona y
 * período por período, con una orden de pago que arma la app (el resumen que
 * se envía a quien paga) y el comprobante de que ya se pagó (se sube después).
 *
 * No pasa por el motor genérico de `documentos-adjuntos.ts` porque acá hay dos
 * documentos distintos con efectos distintos (generar la orden no cambia el
 * estado; subir el comprobante sí lo marca PAGADO), y el registro puede no
 * existir todavía la primera vez que se toca la pantalla.
 */

const TIPO_CUENTA: Record<string, string> = { AHORROS: 'cuenta de ahorros', CORRIENTE: 'cuenta corriente', BILLETERA_DIGITAL: 'billetera digital' }

type FilaAsistenciaPersona = {
  documento: string
  nombre: string
  sede: string | null
  horas: Record<string, number>
  horasExtra: number
  valor: number | null
}

/** Cruza AsistencIA por cédula y devuelve solo la fila de esa persona (o null si no aparece). */
async function filaDeAsistencia(colaboradorId: string, mes: string, quincena: 1 | 2 | null): Promise<FilaAsistenciaPersona | null> {
  const c = await prisma.colaborador.findUniqueOrThrow({ where: { id: colaboradorId }, select: { numeroDocumento: true } })
  const r = await resumenAsistencia({ mes, quincena })
  const cedula = normalizarCedula(c.numeroDocumento)
  const e = r.empleados.find((x) => normalizarCedula(x.documento) === cedula)
  if (!e) return null
  return {
    documento: e.documento,
    nombre: e.nombre ?? e.documento,
    sede: e.sede,
    horas: Object.fromEntries(CODIGOS_ASISTENCIA.map((cod) => [cod, e.horas[cod] ?? 0])),
    horasExtra: e.horasExtra,
    valor: e.valor,
  }
}

/**
 * Deja el registro del pago al día con lo que reporta AsistencIA ahora mismo.
 * Una vez PAGADO no se vuelve a tocar el valor: lo que se pagó, se pagó — para
 * corregirlo hay que desmarcarlo primero.
 */
async function upsertPago(colaboradorId: string, mes: string, quincena: 1 | 2 | null) {
  const rango = rangoDePeriodo(mes, quincena)
  const desde = parseFechaISO(rango.desde)!
  const hasta = parseFechaISO(rango.hasta)!

  const previo = await prisma.pagoHorasExtra.findUnique({ where: { colaboradorId_desde_hasta: { colaboradorId, desde, hasta } } })
  if (previo?.estado === 'PAGADO') return previo

  const fila = await filaDeAsistencia(colaboradorId, mes, quincena)
  if (!fila || fila.horasExtra <= 0) throw new ErrorNegocio('Esta persona no tiene horas extra en AsistencIA para este período.')
  if (fila.valor == null) throw new ErrorNegocio('Esta persona no tiene salario registrado en AsistencIA: allá no se puede calcular el valor.')

  return dbAuditado.pagoHorasExtra.upsert({
    where: { colaboradorId_desde_hasta: { colaboradorId, desde, hasta } },
    create: { colaboradorId, desde, hasta, horasExtra: fila.horasExtra, valor: fila.valor, detalleHoras: fila.horas },
    update: { horasExtra: fila.horasExtra, valor: fila.valor, detalleHoras: fila.horas },
  })
}

/** Arma (o rehace) el PDF de la orden de pago y lo deja como Documento del colaborador. */
export async function generarOrdenPagoHorasExtra(opts: {
  colaboradorId: string
  mes: string
  quincena: 1 | 2 | null
  usuarioId: string
}): Promise<{ documentoId: string; pagoId: string }> {
  const pago = await upsertPago(opts.colaboradorId, opts.mes, opts.quincena)
  if (pago.estado === 'PAGADO') throw new ErrorNegocio('Este pago ya está marcado como pagado: desmárcalo antes de rehacer la orden.')

  const [colaborador, empresa, { src, propio }] = await Promise.all([
    prisma.colaborador.findUniqueOrThrow({
      where: { id: opts.colaboradorId },
      include: { banco: true },
    }),
    prisma.configuracionEmpresa.findFirstOrThrow(),
    fondoMembrete(),
  ])

  const pdf = await renderOrdenPagoHorasExtra(
    {
      empresa: { razonSocial: empresa.razonSocial, nombreComercial: empresa.nombreComercial, nit: empresa.nit, emailContacto: empresa.emailContacto, sitioWeb: empresa.sitioWeb },
      numero: `OP-${pago.id.slice(0, 8).toUpperCase()}`,
      fecha: new Date(),
      colaborador: {
        nombre: `${colaborador.nombres} ${colaborador.apellidos}`,
        documento: colaborador.numeroDocumento,
        banco: colaborador.banco?.nombre ?? null,
        tipoCuenta: colaborador.tipoCuenta ? TIPO_CUENTA[colaborador.tipoCuenta] : null,
        numeroCuenta: colaborador.numeroCuenta,
      },
      periodo: { desde: pago.desde.toISOString().slice(0, 10), hasta: pago.hasta.toISOString().slice(0, 10) },
      detalleHoras: (pago.detalleHoras as Record<string, number> | null) ?? {},
      horasExtra: Number(pago.horasExtra),
      valor: Number(pago.valor),
    },
    propio ? src : undefined,
  )

  const sha256 = createHash('sha256').update(pdf).digest('hex')
  const archivo = await subirArchivo(`colaboradores/${opts.colaboradorId}/pagos-horas-extra`, `orden-pago-${pago.id}.pdf`, pdf, 'application/pdf')
  const doc = await dbAuditado.documento.create({
    data: {
      entidadTipo: 'PagoHorasExtra',
      entidadId: pago.id,
      nombre: `Orden de pago de horas extra · ${pago.desde.toISOString().slice(0, 10)} a ${pago.hasta.toISOString().slice(0, 10)}`,
      bucket: archivo.bucket,
      storagePath: archivo.storagePath,
      mimeType: 'application/pdf',
      tamanoBytes: archivo.tamanoBytes,
      sha256,
      nivelAcceso: 'GENERAL',
      subidoPorId: opts.usuarioId,
    },
  })

  // Se reapunta el campo ANTES de borrar el anterior: si algo falla antes de
  // llegar aquí, se queda el viejo, que es mejor que quedarse sin ninguno.
  await dbAuditado.pagoHorasExtra.update({ where: { id: pago.id }, data: { ordenDocId: doc.id } })
  if (pago.ordenDocId && pago.ordenDocId !== doc.id) await eliminarDocumento(pago.ordenDocId).catch(() => {})

  return { documentoId: doc.id, pagoId: pago.id }
}

/**
 * Sube el soporte de que el pago ya se hizo (transferencia, consignación…) y
 * marca el registro como PAGADO. Si el pago no existía todavía —se subió el
 * comprobante sin pasar por "Generar orden" primero—, se crea con el valor que
 * AsistencIA reporta en ese momento.
 */
export async function subirComprobantePagoHorasExtra(opts: {
  colaboradorId: string
  mes: string
  quincena: 1 | 2 | null
  pdfBase64: string
  nombreArchivo?: string | null
  usuarioId: string
}): Promise<{ documentoId: string; pagoId: string }> {
  const base64 = opts.pdfBase64.split(',')[1] ?? ''
  const archivo = Buffer.from(base64, 'base64')
  if (archivo.byteLength === 0) throw new ErrorNegocio('El comprobante está vacío.')
  const mimeType = opts.pdfBase64.startsWith('data:image/') ? opts.pdfBase64.slice(5, opts.pdfBase64.indexOf(';')) : 'application/pdf'

  const pago = await upsertPago(opts.colaboradorId, opts.mes, opts.quincena)
  // Ya pagado: el nuevo comprobante reemplaza al anterior (corrección), pero no
  // vuelve a recalcular el valor (upsertPago ya lo protege).

  const sha256 = createHash('sha256').update(archivo).digest('hex')
  const ext = mimeType === 'application/pdf' ? 'pdf' : mimeType.split('/')[1] || 'jpg'
  const subida = await subirArchivo(`colaboradores/${opts.colaboradorId}/pagos-horas-extra`, `comprobante-${pago.id}.${ext}`, archivo, mimeType)
  const doc = await dbAuditado.documento.create({
    data: {
      entidadTipo: 'PagoHorasExtra',
      entidadId: pago.id,
      nombre: (opts.nombreArchivo && opts.nombreArchivo.trim()) || `Comprobante de pago de horas extra · ${pago.desde.toISOString().slice(0, 10)} a ${pago.hasta.toISOString().slice(0, 10)}`,
      bucket: subida.bucket,
      storagePath: subida.storagePath,
      mimeType,
      tamanoBytes: subida.tamanoBytes,
      sha256,
      nivelAcceso: 'GENERAL',
      subidoPorId: opts.usuarioId,
    },
  })

  await dbAuditado.pagoHorasExtra.update({
    where: { id: pago.id },
    data: { comprobanteDocId: doc.id, estado: 'PAGADO', pagadoEn: new Date(), pagadoPorId: opts.usuarioId },
  })
  if (pago.comprobanteDocId && pago.comprobanteDocId !== doc.id) await eliminarDocumento(pago.comprobanteDocId).catch(() => {})

  return { documentoId: doc.id, pagoId: pago.id }
}

/** Deshace la marca de pagado: para corregir un comprobante subido por error. El comprobante se retira. */
export async function marcarPagoHorasExtraPendiente(opts: { colaboradorId: string; mes: string; quincena: 1 | 2 | null }): Promise<void> {
  const rango = rangoDePeriodo(opts.mes, opts.quincena)
  const desde = parseFechaISO(rango.desde)!
  const hasta = parseFechaISO(rango.hasta)!
  const pago = await prisma.pagoHorasExtra.findUnique({ where: { colaboradorId_desde_hasta: { colaboradorId: opts.colaboradorId, desde, hasta } } })
  if (!pago) return
  if (pago.comprobanteDocId) await eliminarDocumento(pago.comprobanteDocId).catch(() => {})
  await dbAuditado.pagoHorasExtra.update({
    where: { id: pago.id },
    data: { estado: 'PENDIENTE', pagadoEn: null, pagadoPorId: null, comprobanteDocId: null },
  })
}
