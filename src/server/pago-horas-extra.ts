import 'server-only'
import { headers } from 'next/headers'
import { createHash } from 'node:crypto'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { ErrorNegocio } from '@/server/accion'
import { contextoActual } from '@/server/contexto'
import { subirArchivo } from '@/server/storage'
import { eliminarDocumento } from '@/server/documentos'
import { leerFirmaComoDataUri } from '@/server/contratos-ops-pdf'
import { renderOrdenPagoHorasExtra } from '@/server/pdf/pago-horas-extra'
import { cerrarPagoPersonaEnAsistencia } from '@/server/asistencia/pagos-asistencia'
import { resumenAsistencia, normalizarCedula, rangoDePeriodo, CODIGOS_ASISTENCIA } from '@/server/asistencia/cliente'
import { avisar, avisarPorRol, usuarioDeColaborador } from '@/server/notificaciones/avisar'
import { nombreCorto } from '@/lib/notificaciones/texto'
import { formatFechaLarga, parseFechaISO } from '@/lib/fechas'
import { fmtCOP } from '@/lib/moneda'
import type { PagoHorasExtra } from '@/generated/prisma/client'

/**
 * Pago de horas extra APARTE de la nómina (decisión de esta empresa, no un caso
 * general de la plataforma): lleva su propio estado, persona por persona y
 * período por período. Flujo: se genera la orden de pago → se envía a firmar
 * → el colaborador la firma en su autoservicio (Ley 527, acepta el monto) →
 * solo entonces se puede marcar como pagada, con el comprobante de que ya se
 * hizo (se sube en ese momento).
 *
 * No pasa por el motor genérico de `documentos-adjuntos.ts` porque acá hay dos
 * documentos con efectos de estado distintos y el registro puede no existir
 * todavía la primera vez que se toca la pantalla.
 *
 * Dos formas de identificar el registro, según quién llama: por (colaborador,
 * mes, quincena) —lo que ve la pantalla de nómina antes de que exista la fila—
 * o por `pagoId` directo —una vez existe, es lo único que sabe el autoservicio
 * y evita reconstruir el período a partir de `desde`/`hasta` (ambiguo: un
 * `hasta` de fin de mes puede ser la quincena 2 o el mes completo)—.
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
 * Desde que la orden sale a firmar el valor queda CONGELADO: lo que se firma no
 * se debe mover solo, así que ya no se vuelve a tocar (ni al pagar, ni si se
 * regresa a corregir). Solo mientras está PENDIENTE se refresca contra AsistencIA.
 */
async function upsertPago(colaboradorId: string, mes: string, quincena: 1 | 2 | null): Promise<PagoHorasExtra> {
  const rango = rangoDePeriodo(mes, quincena)
  const desde = parseFechaISO(rango.desde)!
  const hasta = parseFechaISO(rango.hasta)!

  const previo = await prisma.pagoHorasExtra.findUnique({ where: { colaboradorId_desde_hasta: { colaboradorId, desde, hasta } } })
  if (previo && previo.estado !== 'PENDIENTE') return previo

  const fila = await filaDeAsistencia(colaboradorId, mes, quincena)
  if (!fila || fila.horasExtra <= 0) throw new ErrorNegocio('Esta persona no tiene horas extra en AsistencIA para este período.')
  if (fila.valor == null) throw new ErrorNegocio('Esta persona no tiene salario registrado en AsistencIA: allá no se puede calcular el valor.')

  return dbAuditado.pagoHorasExtra.upsert({
    where: { colaboradorId_desde_hasta: { colaboradorId, desde, hasta } },
    create: { colaboradorId, desde, hasta, horasExtra: fila.horasExtra, valor: fila.valor, detalleHoras: fila.horas },
    update: { horasExtra: fila.horasExtra, valor: fila.valor, detalleHoras: fila.horas },
  })
}

/**
 * Arma el PDF de la orden de pago para un registro que YA existe. Lo comparten
 * la vista previa, el guardado y el re-armado al firmar (con la firma
 * incrustada): así el PDF que se ve antes de guardar es EXACTAMENTE el que
 * queda archivado.
 */
async function renderizarPdfDePago(pago: PagoHorasExtra, firma?: { dataUri: string; fecha: Date } | null): Promise<Buffer> {
  const [colaborador, empresa] = await Promise.all([
    prisma.colaborador.findUniqueOrThrow({ where: { id: pago.colaboradorId }, include: { banco: true } }),
    prisma.configuracionEmpresa.findFirstOrThrow(),
  ])

  return renderOrdenPagoHorasExtra(
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
      firma: firma ? { dataUri: firma.dataUri, fecha: formatFechaLarga(firma.fecha) } : null,
    },
  )
}

/** `upsertPago` + render, para cuando el registro puede no existir todavía (vista previa y guardado). */
async function construirPdfOrden(colaboradorId: string, mes: string, quincena: 1 | 2 | null) {
  const pago = await upsertPago(colaboradorId, mes, quincena)
  if (pago.estado !== 'PENDIENTE') {
    throw new ErrorNegocio('Esta orden ya se envió a firmar: no se puede rehacer (cambiaría lo que el colaborador está firmando).')
  }
  const pdf = await renderizarPdfDePago(pago)
  return { pago, pdf }
}

/**
 * Arma el PDF SIN guardar nada: es solo para mirarlo antes de decidir. No toca
 * el documento archivado ni cambia ningún estado (el snapshot de horas/valor sí
 * se deja al día, porque es lo mismo que se vería si se guarda).
 */
export async function previsualizarOrdenPagoHorasExtra(opts: {
  colaboradorId: string
  mes: string
  quincena: 1 | 2 | null
}): Promise<{ pdfBase64: string }> {
  const { pdf } = await construirPdfOrden(opts.colaboradorId, opts.mes, opts.quincena)
  return { pdfBase64: `data:application/pdf;base64,${pdf.toString('base64')}` }
}

/**
 * Deja la orden de pago guardada como Documento del colaborador: el PDF que se
 * ve en "Ver orden" desde ahora en adelante. No se envía a nadie todavía —eso
 * es "Enviar a firmar"—: es un PDF que se puede revisar antes de mandarlo.
 */
export async function generarOrdenPagoHorasExtra(opts: {
  colaboradorId: string
  mes: string
  quincena: 1 | 2 | null
  usuarioId: string
}): Promise<{ documentoId: string; pagoId: string }> {
  const { pago, pdf } = await construirPdfOrden(opts.colaboradorId, opts.mes, opts.quincena)

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
 * Envía la orden ya generada al autoservicio del colaborador para que la
 * firme (acepta el monto, Ley 527). Exige que tenga usuario de acceso: sin
 * eso no podría entrar a firmar.
 */
export async function enviarOrdenHorasExtraAFirma(pagoId: string): Promise<void> {
  const pago = await prisma.pagoHorasExtra.findUniqueOrThrow({ where: { id: pagoId } })
  if (!pago.ordenDocId) throw new ErrorNegocio('Genera y guarda la orden antes de enviarla a firmar.')
  if (pago.estado !== 'PENDIENTE') throw new ErrorNegocio('Esta orden ya se envió a firmar.')

  const uid = await usuarioDeColaborador(pago.colaboradorId)
  if (!uid) throw new ErrorNegocio('Este colaborador no tiene usuario de acceso, así que no podría firmar desde el autoservicio. Créale el acceso primero.')

  await dbAuditado.pagoHorasExtra.update({ where: { id: pago.id }, data: { estado: 'ENVIADA_A_FIRMA' } })
  await avisar(uid, {
    evento: 'pago_horas_extra_por_firmar',
    titulo: 'Firma la orden de pago de tus horas extra',
    mensaje: `Del ${pago.desde.toISOString().slice(0, 10)} al ${pago.hasta.toISOString().slice(0, 10)} · ${fmtCOP(Number(pago.valor))}.`,
    enlace: '/autoservicio/horas-extra',
    llamadoAccion: 'Revisar y firmar',
  }).catch(() => {})
}

/**
 * Aplica la firma del colaborador (espejo simplificado de la firma de
 * contratos: aquí solo firma quien recibe el pago) y re-arma la orden con el
 * PNG incrustado — el mismo PDF que se envió, con la firma encima; nada más
 * cambia. Deja rastro probatorio en `EvidenciaFirmaContrato`, igual que las
 * demás firmas de la plataforma.
 */
export async function firmarOrdenHorasExtra(opts: {
  pagoId: string
  firmaDataUri: string
  usuarioId: string
  metodoAuth?: string
}): Promise<{ documentoId: string }> {
  const pago = await prisma.pagoHorasExtra.findUniqueOrThrow({ where: { id: opts.pagoId } })
  if (pago.estado !== 'ENVIADA_A_FIRMA') throw new ErrorNegocio('Esta orden no está esperando firma.')

  const base64 = opts.firmaDataUri.split(',')[1] ?? ''
  const png = Buffer.from(base64, 'base64')
  if (png.byteLength === 0) throw new ErrorNegocio('La firma está vacía.')
  const archivoFirma = await subirArchivo(`colaboradores/${pago.colaboradorId}/pagos-horas-extra/firmas`, `firma-${pago.id}.png`, png, 'image/png')

  const ahora = new Date()
  const firmaImg = await leerFirmaComoDataUri(archivoFirma.storagePath)
  const pdf = await renderizarPdfDePago(pago, { dataUri: firmaImg, fecha: ahora })

  const sha256 = createHash('sha256').update(pdf).digest('hex')
  const archivoOrden = await subirArchivo(`colaboradores/${pago.colaboradorId}/pagos-horas-extra`, `orden-pago-${pago.id}-firmada.pdf`, pdf, 'application/pdf')
  const doc = await dbAuditado.documento.create({
    data: {
      entidadTipo: 'PagoHorasExtra',
      entidadId: pago.id,
      nombre: `Orden de pago de horas extra (firmada) · ${pago.desde.toISOString().slice(0, 10)} a ${pago.hasta.toISOString().slice(0, 10)}`,
      bucket: archivoOrden.bucket,
      storagePath: archivoOrden.storagePath,
      mimeType: 'application/pdf',
      tamanoBytes: archivoOrden.tamanoBytes,
      sha256,
      nivelAcceso: 'GENERAL',
      subidoPorId: opts.usuarioId,
    },
  })

  // Se reapunta ANTES de borrar el anterior (mismo orden seguro que el resto del PDF).
  await dbAuditado.pagoHorasExtra.update({
    where: { id: pago.id },
    data: { ordenDocId: doc.id, estado: 'FIRMADA', firmaPath: archivoFirma.storagePath, firmaFecha: ahora, firmaPorId: opts.usuarioId },
  })
  if (pago.ordenDocId && pago.ordenDocId !== doc.id) await eliminarDocumento(pago.ordenDocId).catch(() => {})

  const ctx = contextoActual()
  const userAgent = (await headers()).get('user-agent')
  await prisma.evidenciaFirmaContrato.create({
    data: {
      pagoHorasExtraId: pago.id,
      rol: 'EMPLEADO',
      userId: opts.usuarioId,
      userEmail: ctx.userEmail,
      ip: ctx.ip,
      userAgent: userAgent ?? null,
      metodoAuth: opts.metodoAuth ?? 'SESION',
      documentos: [{ tipo: 'ORDEN_PAGO_HORAS_EXTRA', documentoId: doc.id, sha256 }],
      firmadoEn: ahora,
    },
  })

  const colaborador = await prisma.colaborador.findUnique({ where: { id: pago.colaboradorId }, select: { nombres: true, apellidos: true } })
  const nombre = nombreCorto(colaborador?.nombres, colaborador?.apellidos)

  // Con la firma, el período de esta persona se cierra en AsistencIA: allá
  // queda congelado y marcado como pagado. Si no se pudo, se avisa y se
  // vuelve a intentar al marcar el pago.
  const cierre = await cerrarPagoPersonaEnAsistencia(pago)
  if (cierre.cerrado) {
    await dbAuditado.pagoHorasExtra.update({ where: { id: pago.id }, data: { asistenciaAnotadoEn: ahora } })
  }

  await avisarPorRol(['Administrador', 'Recursos Humanos'], {
    evento: 'pago_horas_extra_firmado',
    titulo: `${nombre} firmó la orden de sus horas extra`,
    mensaje: `${pago.desde.toISOString().slice(0, 10)} a ${pago.hasta.toISOString().slice(0, 10)} · ${fmtCOP(Number(pago.valor))}. Ya se puede pagar.${cierre.cerrado ? ' Quedó cerrado y marcado como pagado en AsistencIA.' : ''}`,
    colaboradorId: pago.colaboradorId,
    enlace: '/nomina/novedades?tab=horas',
    llamadoAccion: 'Ir a pagarla',
  }).catch(() => {})
  if (cierre.error) {
    await avisarPorRol(['Administrador', 'Recursos Humanos'], {
      evento: 'pago_horas_extra_firmado',
      titulo: `No se pudo cerrar en AsistencIA las horas de ${nombre}`,
      mensaje: `${cierre.error} Se volverá a intentar al marcar el pago.`,
      colaboradorId: pago.colaboradorId,
      enlace: '/nomina/novedades?tab=horas',
    }).catch(() => {})
  }

  return { documentoId: doc.id }
}

/**
 * Marca el registro como PAGADO. Exige que la orden ya esté FIRMADA: en esta
 * empresa no se paga sin que el colaborador haya aceptado el monto primero. El
 * comprobante (soporte de la transferencia o consignación) es OPCIONAL: se
 * puede confirmar el pago sin tenerlo a la mano y adjuntarlo después
 * (desmarcar y volver a marcar con el archivo).
 */
export async function marcarPagoHorasExtraPagado(opts: {
  pagoId: string
  /** Data URI del comprobante; sin él, queda pagado pero sin soporte adjunto. */
  pdfBase64?: string | null
  nombreArchivo?: string | null
  usuarioId: string
}): Promise<{ documentoId: string | null }> {
  const pago = await prisma.pagoHorasExtra.findUniqueOrThrow({ where: { id: opts.pagoId } })
  if (pago.estado !== 'FIRMADA') {
    throw new ErrorNegocio('La orden debe estar firmada por el colaborador antes de poder marcar el pago.')
  }

  // Si al firmar no se pudo cerrar en AsistencIA, se reintenta ahora.
  if (!pago.asistenciaAnotadoEn) {
    const cierre = await cerrarPagoPersonaEnAsistencia(pago)
    if (cierre.cerrado) await dbAuditado.pagoHorasExtra.update({ where: { id: pago.id }, data: { asistenciaAnotadoEn: new Date() } })
  }

  if (!opts.pdfBase64) {
    await dbAuditado.pagoHorasExtra.update({
      where: { id: pago.id },
      data: { estado: 'PAGADO', pagadoEn: new Date(), pagadoPorId: opts.usuarioId },
    })
    return { documentoId: pago.comprobanteDocId }
  }

  const base64 = opts.pdfBase64.split(',')[1] ?? ''
  const archivo = Buffer.from(base64, 'base64')
  if (archivo.byteLength === 0) throw new ErrorNegocio('El comprobante está vacío.')
  const mimeType = opts.pdfBase64.startsWith('data:image/') ? opts.pdfBase64.slice(5, opts.pdfBase64.indexOf(';')) : 'application/pdf'

  const sha256 = createHash('sha256').update(archivo).digest('hex')
  const ext = mimeType === 'application/pdf' ? 'pdf' : mimeType.split('/')[1] || 'jpg'
  const subida = await subirArchivo(`colaboradores/${pago.colaboradorId}/pagos-horas-extra`, `comprobante-${pago.id}.${ext}`, archivo, mimeType)
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

  return { documentoId: doc.id }
}

/**
 * Deshace la marca de pagado: para corregir un comprobante subido por error.
 * El comprobante se retira, pero la firma queda intacta (vuelve a FIRMADA, no
 * a PENDIENTE: el colaborador ya aceptó el monto, eso no se deshace aquí).
 */
export async function marcarPagoHorasExtraPendiente(pagoId: string): Promise<void> {
  const pago = await prisma.pagoHorasExtra.findUnique({ where: { id: pagoId } })
  if (!pago || pago.estado !== 'PAGADO') return
  if (pago.comprobanteDocId) await eliminarDocumento(pago.comprobanteDocId).catch(() => {})
  await dbAuditado.pagoHorasExtra.update({
    where: { id: pago.id },
    data: { estado: 'FIRMADA', pagadoEn: null, pagadoPorId: null, comprobanteDocId: null },
  })
}
