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
import { renderActaPazYSalvo } from '@/server/pdf/paz-y-salvo'
import { renderLiquidacionDefinitiva } from '@/server/pdf/liquidacion-definitiva'
import { renderCartaTerminacion } from '@/server/pdf/carta-terminacion'
import type { FirmaAplicada } from '@/server/pdf/firmas-terminacion'
import { avisar, avisarPorRol, usuarioDeColaborador } from '@/server/notificaciones/avisar'
import { nombreCorto } from '@/lib/notificaciones/texto'
import { formatFechaCorta, formatFechaLarga, hoyBogota } from '@/lib/fechas'
import { filasLiquidacion, leerDetalleLiquidacion } from '@/lib/terminaciones/liquidacion-filas'
import { CARTA_PRINCIPAL, CLAVE_TEXTO_CARTA, NOMBRE_CARTA, type TipoCarta } from '@/lib/terminaciones/cartas'
import { fmtCOP } from '@/lib/moneda'

/**
 * Documentos de la terminación que se firman en la plataforma (Ley 527): la
 * carta (según el tipo: aceptación de la renuncia, terminación, no prórroga o
 * mutuo acuerdo), el acta de paz y salvo y la liquidación definitiva. Los tres
 * siguen el mismo camino:
 *
 *   1. Talento Humano lo envía y, al enviarlo, firma por la empresa (firma
 *      dibujada + código a su correo).
 *   2. El trabajador lo firma desde su autoservicio (aunque ya esté retirado).
 *   3. La liquidación, además, se marca pagada con su comprobante.
 *
 * Sin la carta y el paz y salvo firmados y la liquidación firmada y pagada no
 * se cierra la terminación. Los PDF se guardan como documentos del colaborador
 * (entidad "Colaborador"): él los puede abrir y quedan en su expediente.
 */

export type TipoDocTerminacion = 'CARTA' | 'PAZ_Y_SALVO' | 'LIQUIDACION'

const ARCHIVO_DOC: Record<TipoDocTerminacion, string> = { CARTA: 'cartas', PAZ_Y_SALVO: 'paz-y-salvo', LIQUIDACION: 'liquidacion' }

export const MOTIVO_TERMINACION: Record<string, string> = {
  RENUNCIA_VOLUNTARIA: 'renuncia voluntaria', SIN_JUSTA_CAUSA: 'terminación sin justa causa', CON_JUSTA_CAUSA: 'terminación con justa causa',
  TERMINACION_ANTICIPADA: 'terminación anticipada', MUTUO_ACUERDO: 'mutuo acuerdo', VENCIMIENTO_PLAZO: 'vencimiento del plazo',
  PERIODO_PRUEBA: 'terminación en periodo de prueba', FIN_OPS: 'fin del contrato de prestación de servicios',
}

/** Los campos de firma, iguales en CartaTerminacion, PazYSalvo y LiquidacionDefinitiva. */
type CamposFirma = {
  documentoId?: string | null
  enviadoFirmaEn?: Date | null
  firmaEmpresaPath?: string | null
  firmaEmpresaEn?: Date | null
  firmaEmpresaPorId?: string | null
  firmaPath?: string | null
  firmadoEn?: Date | null
  firmadoPorId?: string | null
}

type Registro = Required<CamposFirma> & { id: string; terminacionId: string }

const SEL_FIRMA = {
  id: true, terminacionId: true, documentoId: true, enviadoFirmaEn: true, firmaEmpresaPath: true, firmaEmpresaEn: true,
  firmaEmpresaPorId: true, firmaPath: true, firmadoEn: true, firmadoPorId: true,
} as const

/** La carta obligatoria de una terminación, según su tipo. */
export async function cartaDeTerminacion(terminacionId: string): Promise<TipoCarta> {
  const t = await prisma.terminacion.findUniqueOrThrow({ where: { id: terminacionId }, select: { tipo: true } })
  return CARTA_PRINCIPAL[t.tipo] ?? 'CARTA_TERMINACION'
}

async function leerRegistro(tipo: TipoDocTerminacion, terminacionId: string): Promise<Registro | null> {
  if (tipo === 'CARTA') {
    const carta = await cartaDeTerminacion(terminacionId)
    return prisma.cartaTerminacion.findUnique({ where: { terminacionId_tipo: { terminacionId, tipo: carta } }, select: SEL_FIRMA })
  }
  return tipo === 'PAZ_Y_SALVO'
    ? prisma.pazYSalvo.findUnique({ where: { terminacionId }, select: SEL_FIRMA })
    : prisma.liquidacionDefinitiva.findUnique({ where: { terminacionId }, select: SEL_FIRMA })
}

async function actualizar(tipo: TipoDocTerminacion, id: string, data: CamposFirma) {
  if (tipo === 'CARTA') await dbAuditado.cartaTerminacion.update({ where: { id }, data })
  else if (tipo === 'PAZ_Y_SALVO') await dbAuditado.pazYSalvo.update({ where: { id }, data })
  else await dbAuditado.liquidacionDefinitiva.update({ where: { id }, data })
}

/** La carta principal existe desde que se registra la terminación; las antiguas la crean aquí. */
async function asegurarCarta(terminacionId: string) {
  const tipo = await cartaDeTerminacion(terminacionId)
  await prisma.cartaTerminacion.upsert({
    where: { terminacionId_tipo: { terminacionId, tipo } },
    create: { terminacionId, tipo },
    update: {},
  })
}

async function nombreDocumento(tipo: TipoDocTerminacion, terminacionId: string): Promise<string> {
  if (tipo === 'CARTA') return NOMBRE_CARTA[await cartaDeTerminacion(terminacionId)]
  return tipo === 'PAZ_Y_SALVO' ? 'Acta de paz y salvo' : 'Liquidación definitiva'
}

async function firmaGuardada(path: string | null, fecha: Date | null): Promise<FirmaAplicada | null> {
  return path && fecha ? { dataUri: await leerFirmaComoDataUri(path), fecha } : null
}

/** Datos comunes de los PDF: empresa y colaborador (con su cargo y la ciudad de su sede). */
export async function datosBaseDocumento(colaboradorId: string) {
  const [c, empresa, principal] = await Promise.all([
    prisma.colaborador.findUniqueOrThrow({
      where: { id: colaboradorId },
      include: { cargo: { select: { nombre: true } }, sede: { include: { ciudad: true } } },
    }),
    prisma.configuracionEmpresa.findFirstOrThrow(),
    // Las cartas salen desde la sede principal (p. ej. Pasto), aunque la
    // persona trabaje en otra ciudad.
    prisma.sede.findFirst({ where: { esPrincipal: true }, select: { ciudad: { select: { nombre: true } } } }),
  ])
  return {
    empresa: { razonSocial: empresa.razonSocial, nombreComercial: empresa.nombreComercial, nit: empresa.nit, emailContacto: empresa.emailContacto, sitioWeb: empresa.sitioWeb },
    colaborador: { nombre: `${c.nombres} ${c.apellidos}`, documento: `${c.tipoDocumento} ${c.numeroDocumento}`, cargo: c.cargo?.nombre ?? null },
    ciudad: c.sede?.ciudad.nombre ?? 'Bogotá',
    ciudadEmpresa: principal?.ciudad.nombre ?? null,
    destinatario: {
      correo: c.emailPersonal ?? c.emailCorporativo ?? null,
      lugarExpedicion: c.lugarExpedicionDoc,
      departamento: c.sede?.ciudad.departamento ?? null,
    },
    fechaIngreso: c.fechaIngreso,
  }
}

/** Arma el PDF del documento con las firmas que ya tenga (o las que se pasen). */
async function renderizar(tipo: TipoDocTerminacion, terminacionId: string, firmas: { empresa: FirmaAplicada | null; firmante: string | null; trabajador: FirmaAplicada | null }): Promise<Buffer> {
  const t = await prisma.terminacion.findUniqueOrThrow({
    where: { id: terminacionId },
    include: { pazYSalvo: { include: { items: { orderBy: { id: 'asc' } } } }, liquidacion: true },
  })
  const base = {
    ...(await datosBaseDocumento(t.colaboradorId)),
    fecha: firmas.empresa?.fecha ?? hoyBogota(),
    fechaRetiro: t.fechaRetiro,
    motivo: MOTIVO_TERMINACION[t.tipo] ?? t.tipo,
    firmante: firmas.firmante,
    firmaEmpresa: firmas.empresa,
    firmaTrabajador: firmas.trabajador,
  }

  if (tipo === 'CARTA') {
    const carta = CARTA_PRINCIPAL[t.tipo] ?? 'CARTA_TERMINACION'
    return renderCartaTerminacion(CLAVE_TEXTO_CARTA[carta], { ...base, observaciones: t.motivo, preavisoDias: t.preavisoDias })
  }

  if (tipo === 'PAZ_Y_SALVO') {
    const items = t.pazYSalvo?.items ?? []
    const verificadores = await prisma.user.findMany({
      where: { id: { in: items.map((i) => i.verificadoPorId).filter((x): x is string => !!x) } },
      select: { id: true, name: true },
    })
    const nombreDe = new Map(verificadores.map((u) => [u.id, u.name]))
    return renderActaPazYSalvo({
      ...base,
      areas: items.map((i) => ({
        area: i.area,
        concepto: i.concepto,
        verificadoPor: i.verificadoPorId ? nombreDe.get(i.verificadoPorId) ?? null : null,
        verificadoEn: i.verificadoEn ? formatFechaCorta(i.verificadoEn) : null,
      })),
    })
  }

  const liq = t.liquidacion
  if (!liq) throw new ErrorNegocio('Esta terminación no tiene liquidación.')
  const f = filasLiquidacion(liq, leerDetalleLiquidacion(liq.detalle))
  return renderLiquidacionDefinitiva({
    ...base,
    dias: f.dias, salarioBase: f.salarioBase,
    ingresos: f.ingresos, deducciones: f.deducciones,
    totalIngresos: f.totalIngresos, totalDeducciones: f.totalDeducciones, total: f.total,
  })
}

/** Guarda un PDF (o soporte) como documento del colaborador. */
export async function guardarDocumentoColaborador(opts: {
  colaboradorId: string
  carpeta: string
  archivo: string
  nombre: string
  contenido: Buffer
  mime: string
  usuarioId: string
  nivelAcceso?: 'RRHH' | 'SST_MEDICO'
  entidad?: { tipo: string; id: string }
}) {
  const sha256 = createHash('sha256').update(opts.contenido).digest('hex')
  const subido = await subirArchivo(`colaboradores/${opts.colaboradorId}/${opts.carpeta}`, opts.archivo, opts.contenido, opts.mime)
  const doc = await dbAuditado.documento.create({
    data: {
      entidadTipo: opts.entidad?.tipo ?? 'Colaborador', entidadId: opts.entidad?.id ?? opts.colaboradorId, nombre: opts.nombre,
      bucket: subido.bucket, storagePath: subido.storagePath, mimeType: opts.mime, tamanoBytes: subido.tamanoBytes,
      sha256, nivelAcceso: opts.nivelAcceso ?? 'RRHH', subidoPorId: opts.usuarioId,
    },
  })
  return { documentoId: doc.id, sha256 }
}

/** Un archivo subido como data URI (PDF o imagen): tipo, extensión y contenido. */
export function leerArchivoSubido(dataUri: string): { mime: string; ext: string; contenido: Buffer } {
  const m = dataUri.match(/^data:([^;]+);base64,(.+)$/)
  if (!m) throw new ErrorNegocio('El archivo no es válido.')
  const [, mime, b64] = m
  if (!['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(mime)) throw new ErrorNegocio('El archivo debe ser un PDF o una imagen.')
  return { mime, ext: mime === 'application/pdf' ? 'pdf' : mime.split('/')[1], contenido: Buffer.from(b64, 'base64') }
}

async function evidencia(tipo: TipoDocTerminacion, registroId: string, rol: 'EMPLEADO' | 'EMPLEADOR', usuarioId: string, metodoAuth: string, documentoId: string, sha256: string, fecha: Date) {
  const ctx = contextoActual()
  const vinculo = tipo === 'CARTA' ? { cartaTerminacionId: registroId } : tipo === 'PAZ_Y_SALVO' ? { pazYSalvoId: registroId } : { liquidacionDefinitivaId: registroId }
  await prisma.evidenciaFirmaContrato.create({
    data: {
      ...vinculo,
      rol, userId: usuarioId, userEmail: ctx.userEmail, ip: ctx.ip,
      userAgent: (await headers()).get('user-agent') ?? null,
      metodoAuth,
      documentos: [{ tipo: tipo === 'CARTA' ? 'CARTA_TERMINACION' : tipo === 'PAZ_Y_SALVO' ? 'ACTA_PAZ_Y_SALVO' : 'LIQUIDACION_DEFINITIVA', documentoId, sha256 }],
      firmadoEn: fecha,
    },
  })
}

export async function nombreUsuario(id: string | null): Promise<string | null> {
  if (!id) return null
  return (await prisma.user.findUnique({ where: { id }, select: { name: true } }))?.name ?? null
}

/** Id del registro (carta, paz y salvo o liquidación) de una terminación, para el código de firma. */
export async function idDocumentoTerminacion(tipo: TipoDocTerminacion, terminacionId: string): Promise<string> {
  if (tipo === 'CARTA') await asegurarCarta(terminacionId)
  const r = await leerRegistro(tipo, terminacionId)
  if (!r) throw new ErrorNegocio(tipo === 'PAZ_Y_SALVO' ? 'Esta terminación no tiene paz y salvo.' : 'Esta terminación no tiene liquidación.')
  return r.id
}

/** ¿Está esperando la firma del trabajador? (lo usa su autoservicio antes de pedir el código). */
export async function esperaFirmaTrabajador(tipo: TipoDocTerminacion, terminacionId: string): Promise<boolean> {
  const r = await leerRegistro(tipo, terminacionId)
  return !!r?.enviadoFirmaEn && !r.firmadoEn
}

/**
 * Talento Humano firma por la empresa y lo envía al trabajador. El paz y salvo
 * exige todas las áreas verificadas (decisión de empresa).
 */
export async function enviarDocumentoAFirma(opts: {
  tipo: TipoDocTerminacion
  terminacionId: string
  firmaEmpresaDataUri: string
  usuarioId: string
  metodoAuth: string
}): Promise<void> {
  const { tipo, terminacionId } = opts
  const t = await prisma.terminacion.findUniqueOrThrow({ where: { id: terminacionId }, include: { pazYSalvo: { include: { items: true } } } })
  if (t.estado === 'CERRADA') throw new ErrorNegocio('La terminación ya está cerrada.')
  if (tipo === 'CARTA') await asegurarCarta(terminacionId)
  const r = await leerRegistro(tipo, terminacionId)
  if (!r) throw new ErrorNegocio(tipo === 'PAZ_Y_SALVO' ? 'Esta terminación no tiene paz y salvo.' : 'Esta terminación no tiene liquidación.')
  if (r.enviadoFirmaEn) throw new ErrorNegocio('Ya se envió a firmar.')
  if (tipo === 'PAZ_Y_SALVO' && t.pazYSalvo?.items.some((i) => !i.cumplido)) {
    throw new ErrorNegocio('Todas las áreas deben estar verificadas antes de enviar el acta a firmar.')
  }

  const uid = await usuarioDeColaborador(t.colaboradorId)
  if (!uid) throw new ErrorNegocio('Esta persona no tiene usuario en la plataforma, así que no podría firmar desde su autoservicio. Créale el acceso primero.')

  const png = Buffer.from(opts.firmaEmpresaDataUri.split(',')[1] ?? '', 'base64')
  if (png.byteLength === 0) throw new ErrorNegocio('La firma está vacía.')
  const ahora = new Date()
  const archivoFirma = await subirArchivo(`colaboradores/${t.colaboradorId}/${ARCHIVO_DOC[tipo]}/firmas`, `firma-empresa-${r.id}.png`, png, 'image/png')
  const firmaEmpresa = { dataUri: await leerFirmaComoDataUri(archivoFirma.storagePath), fecha: ahora }

  const nombre = await nombreDocumento(tipo, terminacionId)
  const pdf = await renderizar(tipo, terminacionId, { empresa: firmaEmpresa, firmante: await nombreUsuario(opts.usuarioId), trabajador: null })
  const { documentoId, sha256 } = await guardarDocumentoColaborador({
    colaboradorId: t.colaboradorId, carpeta: ARCHIVO_DOC[tipo], archivo: `${ARCHIVO_DOC[tipo]}-${r.id}.pdf`, nombre,
    contenido: pdf, mime: 'application/pdf', usuarioId: opts.usuarioId,
  })
  await actualizar(tipo, r.id, {
    documentoId, enviadoFirmaEn: ahora,
    firmaEmpresaPath: archivoFirma.storagePath, firmaEmpresaEn: ahora, firmaEmpresaPorId: opts.usuarioId,
  })
  if (r.documentoId && r.documentoId !== documentoId) await eliminarDocumento(r.documentoId).catch(() => {})
  await evidencia(tipo, r.id, 'EMPLEADOR', opts.usuarioId, opts.metodoAuth, documentoId, sha256, ahora)

  const aviso = {
    CARTA: { evento: 'carta_terminacion_por_firmar', titulo: `Firma el recibido: ${nombre.toLowerCase()}`, mensaje: 'Talento Humano te envió una comunicación de tu retiro. Revísala y firma el recibido desde la app.' },
    PAZ_Y_SALVO: { evento: 'paz_y_salvo_por_firmar', titulo: 'Firma tu acta de paz y salvo', mensaje: 'Talento Humano verificó la entrega de tu puesto. Revisa el acta y fírmala desde la app.' },
    LIQUIDACION: { evento: 'liquidacion_por_firmar', titulo: 'Firma el recibido de tu liquidación', mensaje: 'Tu liquidación definitiva está lista. Revísala y firma el recibido desde la app.' },
  }[tipo]
  await avisar(uid, { ...aviso, enlace: '/autoservicio/retiro', llamadoAccion: 'Revisar y firmar' }).catch(() => {})
}

/** Deshace el envío mientras el trabajador no haya firmado (p. ej. para corregir). */
export async function retirarEnvioDocumento(tipo: TipoDocTerminacion, terminacionId: string): Promise<void> {
  const r = await leerRegistro(tipo, terminacionId)
  if (!r?.enviadoFirmaEn) throw new ErrorNegocio('No se ha enviado a firmar.')
  if (r.firmadoEn) throw new ErrorNegocio('El trabajador ya lo firmó: no se puede retirar.')
  await actualizar(tipo, r.id, { enviadoFirmaEn: null, documentoId: null, firmaEmpresaPath: null, firmaEmpresaEn: null, firmaEmpresaPorId: null })
  if (r.documentoId) await eliminarDocumento(r.documentoId).catch(() => {})
}

/** El trabajador firma: se re-arma el PDF con las dos firmas y queda la evidencia. */
export async function firmarDocumentoTrabajador(opts: {
  tipo: TipoDocTerminacion
  terminacionId: string
  firmaDataUri: string
  usuarioId: string
  metodoAuth: string
}): Promise<{ documentoId: string }> {
  const { tipo, terminacionId } = opts
  const r = await leerRegistro(tipo, terminacionId)
  if (!r?.enviadoFirmaEn || r.firmadoEn) throw new ErrorNegocio('Este documento no está esperando firma.')
  const t = await prisma.terminacion.findUniqueOrThrow({ where: { id: terminacionId }, select: { colaboradorId: true } })

  const png = Buffer.from(opts.firmaDataUri.split(',')[1] ?? '', 'base64')
  if (png.byteLength === 0) throw new ErrorNegocio('La firma está vacía.')
  const ahora = new Date()
  const archivoFirma = await subirArchivo(`colaboradores/${t.colaboradorId}/${ARCHIVO_DOC[tipo]}/firmas`, `firma-${r.id}.png`, png, 'image/png')

  const nombre = await nombreDocumento(tipo, terminacionId)
  const pdf = await renderizar(tipo, terminacionId, {
    empresa: await firmaGuardada(r.firmaEmpresaPath, r.firmaEmpresaEn),
    firmante: await nombreUsuario(r.firmaEmpresaPorId),
    trabajador: { dataUri: await leerFirmaComoDataUri(archivoFirma.storagePath), fecha: ahora },
  })
  const { documentoId, sha256 } = await guardarDocumentoColaborador({
    colaboradorId: t.colaboradorId, carpeta: ARCHIVO_DOC[tipo], archivo: `${ARCHIVO_DOC[tipo]}-${r.id}-firmada.pdf`, nombre: `${nombre} (firmada)`,
    contenido: pdf, mime: 'application/pdf', usuarioId: opts.usuarioId,
  })

  // Se reapunta ANTES de borrar el anterior (mismo orden seguro que el resto de firmas).
  await actualizar(tipo, r.id, { documentoId, firmaPath: archivoFirma.storagePath, firmadoEn: ahora, firmadoPorId: opts.usuarioId })
  if (r.documentoId && r.documentoId !== documentoId) await eliminarDocumento(r.documentoId).catch(() => {})
  await evidencia(tipo, r.id, 'EMPLEADO', opts.usuarioId, opts.metodoAuth, documentoId, sha256, ahora)

  const c = await prisma.colaborador.findUnique({ where: { id: t.colaboradorId }, select: { nombres: true, apellidos: true } })
  const quien = nombreCorto(c?.nombres, c?.apellidos)
  const aviso = {
    CARTA: { evento: 'carta_terminacion_firmada', titulo: `${quien} firmó el recibido: ${nombre.toLowerCase()}`, mensaje: 'Sigue con los demás pasos del retiro.' },
    PAZ_Y_SALVO: { evento: 'paz_y_salvo_firmado', titulo: `${quien} firmó su acta de paz y salvo`, mensaje: 'Sigue con los demás pasos del retiro.' },
    LIQUIDACION: { evento: 'liquidacion_firmada', titulo: `${quien} firmó el recibido de su liquidación`, mensaje: 'Ya se puede registrar el pago.' },
  }[tipo]
  await avisarPorRol(['Administrador', 'Recursos Humanos'], {
    ...aviso,
    colaboradorId: t.colaboradorId,
    enlace: `/terminaciones/${terminacionId}`,
    llamadoAccion: 'Ver terminación',
  }).catch(() => {})

  return { documentoId }
}

/**
 * Registra el pago de la liquidación con su comprobante (transferencia o
 * consignación). Exige el recibido firmado: aquí no se paga sin eso.
 */
export async function registrarPagoLiquidacion(opts: {
  terminacionId: string
  fechaPago: Date
  comprobanteDataUri: string
  nombreArchivo: string
  usuarioId: string
}): Promise<void> {
  const liq = await prisma.liquidacionDefinitiva.findUnique({ where: { terminacionId: opts.terminacionId }, include: { terminacion: true } })
  if (!liq) throw new ErrorNegocio('Esta terminación no tiene liquidación.')
  if (liq.terminacion.estado === 'CERRADA') throw new ErrorNegocio('La terminación ya está cerrada.')
  if (!liq.firmadoEn) throw new ErrorNegocio('Primero el trabajador debe firmar el recibido de la liquidación.')

  const archivo = leerArchivoSubido(opts.comprobanteDataUri)
  const { documentoId } = await guardarDocumentoColaborador({
    colaboradorId: liq.terminacion.colaboradorId, carpeta: 'liquidacion', archivo: `comprobante-pago-${liq.id}.${archivo.ext}`,
    nombre: 'Comprobante de pago de la liquidación', contenido: archivo.contenido, mime: archivo.mime, usuarioId: opts.usuarioId,
  })
  await dbAuditado.liquidacionDefinitiva.update({ where: { id: liq.id }, data: { pagadoEn: opts.fechaPago, comprobanteDocId: documentoId } })
  if (liq.comprobanteDocId && liq.comprobanteDocId !== documentoId) await eliminarDocumento(liq.comprobanteDocId).catch(() => {})

  const uid = await usuarioDeColaborador(liq.terminacion.colaboradorId)
  if (uid) {
    await avisar(uid, {
      evento: 'liquidacion_pagada',
      titulo: 'Se registró el pago de tu liquidación',
      mensaje: `${fmtCOP(Number(liq.total))} · pagada el ${formatFechaLarga(opts.fechaPago)}. El comprobante está en tu autoservicio.`,
      enlace: '/autoservicio/retiro',
    }).catch(() => {})
  }
}
