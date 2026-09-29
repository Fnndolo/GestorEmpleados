import 'server-only'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { ErrorNegocio } from '@/server/accion'
import { eliminarDocumento } from '@/server/documentos'
import { subirArchivo, leerArchivo } from '@/server/storage'
import { renderCuentaCobro } from '@/server/pdf/cuenta-cobro'
import { hoyBogota } from '@/lib/fechas'
import { CUERPO_DEFECTO_CUENTA_COBRO } from '@/lib/plantillas-documento/cuenta-cobro'

const TIPO_CUENTA: Record<string, string> = { AHORROS: 'cuenta de ahorros', CORRIENTE: 'cuenta corriente', BILLETERA_DIGITAL: 'billetera digital' }

/** Lee el logo de la plantilla y lo devuelve como data URI (para el PDF y las muestras). */
export async function logoDataUri(logoPath: string | null): Promise<string | null> {
  if (!logoPath) return null
  try {
    const buf = await leerArchivo(logoPath)
    const ext = logoPath.split('.').pop()?.toLowerCase()
    const mime = ext === 'png' ? 'image/png' : ext === 'svg' ? 'image/svg+xml' : 'image/jpeg'
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

/** Genera el PDF de una cuenta de cobro desde una plantilla y lo guarda como Documento. */
export async function generarPdfCuentaCobro(cuentaId: string, plantillaId: string | null, usuarioId: string, firmaDataUri: string | null = null): Promise<string> {
  const cuenta = await prisma.cuentaCobroOps.findUniqueOrThrow({
    where: { id: cuentaId },
    include: {
      contratoOps: true,
      colaborador: { include: { banco: true, sede: { include: { ciudad: true } } } },
    },
  })
  const empresa = await prisma.configuracionEmpresa.findFirstOrThrow()
  const plantilla = plantillaId
    ? await prisma.plantillaCuentaCobro.findUnique({ where: { id: plantillaId } })
    : await prisma.plantillaCuentaCobro.findFirst({ where: { esDefecto: true, activa: true } })

  const cuerpoDefecto = CUERPO_DEFECTO_CUENTA_COBRO

  // El dueño de la cuenta es el colaborador (directo) o, para OPS antiguas, el del contrato.
  let c = cuenta.colaborador
  if (!c) {
    const conContrato = await prisma.cuentaCobroOps.findUniqueOrThrow({
      where: { id: cuentaId },
      include: { contratoOps: { include: { colaborador: { include: { banco: true, sede: { include: { ciudad: true } } } } } } },
    })
    c = conContrato.contratoOps?.colaborador ?? null
  }
  if (!c) throw new Error('La cuenta de cobro no tiene colaborador asociado.')

  const pdf = await renderCuentaCobro({
    empresa: { razonSocial: empresa.razonSocial, nombreComercial: empresa.nombreComercial, nit: empresa.nit, direccion: empresa.direccion },
    contratista: {
      nombre: `${c.nombres} ${c.apellidos}`, documento: `${c.tipoDocumento} ${c.numeroDocumento}`,
      rut: cuenta.contratoOps?.rut ?? null, banco: c.banco?.nombre ?? null,
      tipoCuenta: c.tipoCuenta ? TIPO_CUENTA[c.tipoCuenta] : null, numeroCuenta: c.numeroCuenta,
    },
    plantilla: {
      encabezado: plantilla?.encabezado ?? null,
      cuerpo: plantilla?.cuerpo ?? cuerpoDefecto,
      pieLegal: plantilla?.pieLegal ?? null,
      logoDataUri: await logoDataUri(plantilla?.logoPath ?? null),
    },
    numero: cuenta.numero,
    periodo: cuenta.periodo,
    concepto: cuenta.concepto,
    valor: Number(cuenta.valor),
    ciudad: c.sede.ciudad.nombre,
    fecha: hoyBogota(),
    firmaDataUri,
  })

  const archivo = await subirArchivo(`cuentas-cobro/${cuenta.id}`, `cuenta-cobro-${cuenta.numero}.pdf`, pdf, 'application/pdf')
  const doc = await prisma.documento.create({
    data: {
      entidadTipo: 'CuentaCobroOps', entidadId: cuenta.id, nombre: `Cuenta de cobro ${cuenta.numero}`,
      bucket: archivo.bucket, storagePath: archivo.storagePath, mimeType: 'application/pdf',
      tamanoBytes: archivo.tamanoBytes, nivelAcceso: 'GENERAL', sedeId: c.sedeId, subidoPorId: usuarioId,
    },
  })
  await prisma.cuentaCobroOps.update({ where: { id: cuenta.id }, data: { documentoId: doc.id } })
  return doc.id
}

/** Entidad de los documentos que prueban el pago de una cuenta de cobro. */
export const ENTIDAD_COMPROBANTE_CUENTA = 'CuentaCobroOpsPago'

/**
 * Registra el pago de una cuenta de cobro aprobada, con su comprobante (PDF o
 * imagen de la transferencia): la cuenta pasa a PAGADA con la fecha del pago y
 * el comprobante queda guardado con ella. Volver a registrarlo en una cuenta ya
 * pagada reemplaza el comprobante y la fecha (p. ej. si se subió el archivo
 * equivocado).
 */
export async function registrarPagoCuentaCobro(opts: {
  cuentaId: string
  fechaPago: Date
  comprobanteDataUri: string
  usuarioId: string
}): Promise<{ numero: string; colaboradorId: string | null; valor: number }> {
  const cuenta = await prisma.cuentaCobroOps.findUniqueOrThrow({
    where: { id: opts.cuentaId },
    include: { soporteSs: true, contratoOps: { select: { colaboradorId: true, sedeId: true } } },
  })
  if (cuenta.estado !== 'APROBADA' && cuenta.estado !== 'PAGADA') {
    throw new ErrorNegocio('Solo se paga una cuenta aprobada.')
  }
  // Misma regla que al marcarla pagada en Contratos: un contratista OPS no se
  // paga sin la seguridad social del periodo verificada como válida.
  if (cuenta.contratoOpsId && cuenta.requierePila && cuenta.soporteSs?.estadoVerificacion !== 'VALIDA') {
    throw new ErrorNegocio('No se puede pagar sin el soporte de seguridad social verificado como válido.')
  }

  const m = opts.comprobanteDataUri.match(/^data:([^;]+);base64,(.+)$/)
  if (!m) throw new ErrorNegocio('El comprobante no es un archivo válido.')
  const [, mime, b64] = m
  if (!['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(mime)) throw new ErrorNegocio('El comprobante debe ser un PDF o una imagen.')
  const contenido = Buffer.from(b64, 'base64')
  if (contenido.byteLength > 8 * 1024 * 1024) throw new ErrorNegocio('El comprobante pesa más de 8 MB.')
  const ext = mime === 'application/pdf' ? 'pdf' : mime.split('/')[1]
  const archivo = await subirArchivo(`cuentas-cobro/${cuenta.id}/pago`, `comprobante-${cuenta.numero}.${ext}`, contenido, mime)

  const anteriores = await prisma.documento.findMany({ where: { entidadTipo: ENTIDAD_COMPROBANTE_CUENTA, entidadId: cuenta.id }, select: { id: true } })
  await dbAuditado.documento.create({
    data: {
      entidadTipo: ENTIDAD_COMPROBANTE_CUENTA, entidadId: cuenta.id, nombre: `Comprobante de pago · ${cuenta.numero}`,
      bucket: archivo.bucket, storagePath: archivo.storagePath, mimeType: mime, tamanoBytes: archivo.tamanoBytes,
      nivelAcceso: 'GENERAL', sedeId: cuenta.contratoOps?.sedeId ?? null, subidoPorId: opts.usuarioId,
    },
  })
  await dbAuditado.cuentaCobroOps.update({ where: { id: cuenta.id }, data: { estado: 'PAGADA', fechaPago: opts.fechaPago } })
  if (anteriores.length) {
    for (const d of anteriores) await eliminarDocumento(d.id).catch(() => {})
  }
  return { numero: cuenta.numero, colaboradorId: cuenta.colaboradorId ?? cuenta.contratoOps?.colaboradorId ?? null, valor: Number(cuenta.valor) }
}
