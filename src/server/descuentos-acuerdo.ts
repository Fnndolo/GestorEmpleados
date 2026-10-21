import 'server-only'
import { headers } from 'next/headers'
import { createHash } from 'node:crypto'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { prisma } from '@/lib/db'
import { Prisma } from '@/generated/prisma/client'
import { dbAuditado } from '@/lib/auditoria'
import { ErrorNegocio } from '@/server/accion'
import { contextoActual } from '@/server/contexto'
import { leerArchivo, subirArchivo } from '@/server/storage'
import { avisar, avisarPorRol, usuarioDeColaborador } from '@/server/notificaciones/avisar'
import { nombreCorto } from '@/lib/notificaciones/texto'
import { formatFechaLarga } from '@/lib/fechas'
import { fmtCOP } from '@/lib/moneda'
import { estamparFirmasEnPdf, type PosicionFirma } from '@/server/pdf/firma-en-pdf'

/**
 * Acuerdo de pago de un descuento de nómina (Nómina → Descuentos).
 *
 * Un descuento exige la autorización escrita del trabajador (CST art. 149). El
 * acuerdo se sube en PDF y de dos maneras: ya firmado en papel, o para que el
 * colaborador lo firme en su autoservicio. En el segundo caso la firma no se
 * dibuja encima del PDF —es un documento ajeno, no se sabe dónde va—: se le
 * agrega al final una hoja de constancia con la firma, quién, cuándo, desde
 * dónde y la huella del acuerdo original, que es lo que prueba el
 * consentimiento (Ley 527).
 */

/** Entidad de los documentos del acuerdo (distinta de «Prestamo», que es la del paz y salvo). */
export const ENTIDAD_ACUERDO = 'AcuerdoDescuento'

/** Guarda el PDF del acuerdo tal como se subió y lo deja ligado al descuento. */
export async function guardarAcuerdo(opts: {
  prestamoId: string
  colaboradorId: string
  pdf: Buffer
  asunto: string
  requiereFirma: boolean
  /** Dónde se dibuja la firma; sin ella, la firma va solo en la hoja de constancia. */
  posicionFirma?: PosicionFirma | null
  usuarioId: string
}): Promise<string> {
  const archivo = await subirArchivo(`colaboradores/${opts.colaboradorId}/descuentos`, `acuerdo-${opts.prestamoId}.pdf`, opts.pdf, 'application/pdf')
  const doc = await dbAuditado.documento.create({
    data: {
      entidadTipo: ENTIDAD_ACUERDO,
      entidadId: opts.prestamoId,
      nombre: `Acuerdo de pago · ${opts.asunto}${opts.requiereFirma ? '' : ' (firmado en físico)'}`,
      bucket: archivo.bucket,
      storagePath: archivo.storagePath,
      mimeType: 'application/pdf',
      tamanoBytes: archivo.tamanoBytes,
      sha256: createHash('sha256').update(opts.pdf).digest('hex'),
      nivelAcceso: 'GENERAL',
      subidoPorId: opts.usuarioId,
    },
  })
  await dbAuditado.prestamo.update({ where: { id: opts.prestamoId }, data: { acuerdoDocId: doc.id, requiereFirma: opts.requiereFirma, posicionFirma: opts.requiereFirma && opts.posicionFirma ? opts.posicionFirma : Prisma.DbNull } })

  if (opts.requiereFirma) {
    const uid = await usuarioDeColaborador(opts.colaboradorId)
    if (uid) {
      await avisar(uid, {
        evento: 'contrato_por_firmar',
        titulo: `Firma tu acuerdo de descuento: ${opts.asunto}`,
        mensaje: 'Revisa el acuerdo de pago y fírmalo en tu autoservicio. El descuento empieza cuando lo firmes.',
        enlace: '/autoservicio/descuentos',
        llamadoAccion: 'Revisar y firmar',
        colaboradorId: opts.colaboradorId,
      }).catch(() => {})
    }
  }
  return doc.id
}

/** El descuento es del colaborador y está esperando su firma. */
export async function acuerdoPorFirmar(prestamoId: string, colaboradorId: string | null) {
  if (!colaboradorId) throw new ErrorNegocio('Tu usuario no está vinculado a una ficha de colaborador.')
  const p = await prisma.prestamo.findUnique({ where: { id: prestamoId } })
  if (!p || p.colaboradorId !== colaboradorId) throw new ErrorNegocio('Este descuento no está a tu nombre.')
  if (!p.requiereFirma || !p.acuerdoDocId) throw new ErrorNegocio('Este descuento no tiene un acuerdo para firmar.')
  if (p.firmaEmpleadoFecha) throw new ErrorNegocio('Ya firmaste este acuerdo.')
  return p
}

/**
 * Firma del colaborador: el acuerdo original más una hoja de constancia con la
 * firma. El original se conserva; el firmado queda como documento aparte.
 */
export async function firmarAcuerdo(opts: { prestamoId: string; firmaDataUri: string; usuarioId: string; metodoAuth: string }) {
  const p = await prisma.prestamo.findUniqueOrThrow({
    where: { id: opts.prestamoId },
    include: { colaborador: { select: { nombres: true, apellidos: true, numeroDocumento: true } } },
  })
  if (!p.acuerdoDocId) throw new ErrorNegocio('Este descuento no tiene acuerdo.')
  if (p.firmaEmpleadoFecha) throw new ErrorNegocio('Este acuerdo ya está firmado.')

  const png = Buffer.from(opts.firmaDataUri.split(',')[1] ?? '', 'base64')
  if (png.byteLength === 0) throw new ErrorNegocio('La firma está vacía.')
  const archivoFirma = await subirArchivo(`colaboradores/${p.colaboradorId}/descuentos/firmas`, `firma-${p.id}.png`, png, 'image/png')

  const original = await prisma.documento.findUniqueOrThrow({ where: { id: p.acuerdoDocId } })
  const pdfOriginal = await leerArchivo(original.storagePath)
  const ahora = new Date()
  const ctx = contextoActual()
  const nombre = `${p.colaborador.nombres} ${p.colaborador.apellidos}`
  // La firma va donde se marcó al subir el acuerdo; la hoja de constancia se
  // agrega igual, porque es la que prueba quién, cuándo y sobre qué firmó.
  const posicion = p.posicionFirma as PosicionFirma | null
  const conFirma = posicion
    ? await estamparFirmasEnPdf({ pdfOriginal, firmas: [{ posicion, imagenDataUri: opts.firmaDataUri }] })
    : pdfOriginal
  const pdf = await agregarConstancia(conFirma, {
    png, nombre, documento: p.colaborador.numeroDocumento, fecha: ahora,
    asunto: p.descripcion ?? 'Descuento de nómina',
    detalle: `${fmtCOP(Number(p.valorTotal))} en ${p.numeroCuotas} cuota${p.numeroCuotas === 1 ? '' : 's'} de ${fmtCOP(Number(p.valorCuota))}, desde ${formatFechaLarga(p.fechaInicio)}`,
    ip: ctx.ip, correo: ctx.userEmail, huellaOriginal: original.sha256 ?? createHash('sha256').update(pdfOriginal).digest('hex'),
  })

  const sha256 = createHash('sha256').update(pdf).digest('hex')
  const archivo = await subirArchivo(`colaboradores/${p.colaboradorId}/descuentos`, `acuerdo-${p.id}-firmado.pdf`, pdf, 'application/pdf')
  const doc = await dbAuditado.documento.create({
    data: {
      entidadTipo: ENTIDAD_ACUERDO,
      entidadId: p.id,
      nombre: `Acuerdo de pago (firmado) · ${p.descripcion ?? 'Descuento'}`,
      bucket: archivo.bucket,
      storagePath: archivo.storagePath,
      mimeType: 'application/pdf',
      tamanoBytes: archivo.tamanoBytes,
      sha256,
      nivelAcceso: 'GENERAL',
      subidoPorId: opts.usuarioId,
    },
  })
  await dbAuditado.prestamo.update({
    where: { id: p.id },
    data: { acuerdoFirmadoDocId: doc.id, firmaEmpleadoFecha: ahora, firmaEmpleadoPath: archivoFirma.storagePath },
  })
  await prisma.evidenciaFirmaContrato.create({
    data: {
      prestamoId: p.id,
      rol: 'EMPLEADO',
      userId: opts.usuarioId,
      userEmail: ctx.userEmail,
      ip: ctx.ip,
      userAgent: (await headers()).get('user-agent') ?? null,
      metodoAuth: opts.metodoAuth,
      documentos: [{ tipo: 'ACUERDO_DESCUENTO', documentoId: doc.id, sha256 }],
      firmadoEn: ahora,
    },
  })

  await avisarPorRol(['Administrador', 'Recursos Humanos'], {
    evento: 'contrato_firmado',
    titulo: `${nombreCorto(p.colaborador.nombres, p.colaborador.apellidos)} firmó su acuerdo de descuento`,
    mensaje: `${p.descripcion ?? 'Descuento'} · ${fmtCOP(Number(p.valorTotal))}. Desde ahora entra en la nómina.`,
    colaboradorId: p.colaboradorId,
    enlace: `/nomina/prestamos/${p.id}`,
  }).catch(() => {})
  return { documentoId: doc.id }
}

/** Hoja final con la firma y los datos que prueban quién, cuándo y sobre qué documento. */
async function agregarConstancia(pdfOriginal: Buffer, d: {
  png: Buffer; nombre: string; documento: string | null; fecha: Date; asunto: string; detalle: string
  ip: string | null; correo: string | null; huellaOriginal: string
}): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfOriginal, { ignoreEncryption: true })
  const pagina = doc.addPage([612, 792])
  const fuente = await doc.embedFont(StandardFonts.Helvetica)
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold)
  const gris = rgb(0.35, 0.35, 0.35)
  let y = 720
  const linea = (texto: string, opciones: { f?: typeof fuente; t?: number; c?: ReturnType<typeof rgb> } = {}) => {
    pagina.drawText(texto, { x: 60, y, size: opciones.t ?? 10, font: opciones.f ?? fuente, color: opciones.c ?? rgb(0, 0, 0), maxWidth: 492 })
    y -= (opciones.t ?? 10) + 8
  }
  linea('CONSTANCIA DE FIRMA ELECTRÓNICA', { f: negrita, t: 14 })
  linea('Acuerdo de pago · autorización de descuento de nómina (CST art. 149)', { c: gris })
  y -= 10
  linea(`Asunto: ${d.asunto}`)
  linea(`Condiciones: ${d.detalle}`)
  y -= 6
  linea(`Firmante: ${d.nombre}${d.documento ? ` · C.C. ${d.documento}` : ''}`, { f: negrita })
  linea(`Fecha y hora: ${d.fecha.toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'long', timeStyle: 'short' })}`)
  if (d.correo) linea(`Autorizada con código enviado a: ${d.correo}`)
  if (d.ip) linea(`Dirección IP: ${d.ip}`)
  y -= 10
  const img = await doc.embedPng(d.png)
  const escala = Math.min(200 / img.width, 70 / img.height)
  pagina.drawImage(img, { x: 60, y: y - img.height * escala, width: img.width * escala, height: img.height * escala })
  y -= img.height * escala + 6
  pagina.drawLine({ start: { x: 60, y }, end: { x: 280, y }, thickness: 0.6, color: gris })
  y -= 14
  linea(d.nombre, { t: 9 })
  y -= 16
  linea('Huella (SHA-256) del acuerdo firmado, páginas anteriores a esta:', { t: 8, c: gris })
  linea(d.huellaOriginal, { t: 7, c: gris })
  linea('Firmado en la plataforma de Gestión Humana de KUPOCELL S.A.S. (Ley 527 de 1999).', { t: 8, c: gris })
  return Buffer.from(await doc.save())
}
