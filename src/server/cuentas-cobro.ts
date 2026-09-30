import 'server-only'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { ErrorNegocio } from '@/server/accion'
import { eliminarDocumento } from '@/server/documentos'
import { subirArchivo } from '@/server/storage'
import { renderCuentaCobro } from '@/server/pdf/cuenta-cobro'
import { hoyBogota } from '@/lib/fechas'

const TIPO_CUENTA: Record<string, string> = { AHORROS: 'Ahorros', CORRIENTE: 'Corriente', BILLETERA_DIGITAL: 'Billetera digital' }

/**
 * Genera el PDF de una cuenta de cobro y lo guarda como Documento. El texto es
 * el de Ajustes → Plantillas de documentos → Cuenta de cobro; los datos salen
 * de la cuenta, de la ficha del contratista y de la empresa.
 */
export async function generarPdfCuentaCobro(cuentaId: string, usuarioId: string, firmaDataUri: string | null = null): Promise<string> {
  const incluir = { banco: true, sede: { include: { ciudad: true } } } as const
  const cuenta = await prisma.cuentaCobroOps.findUniqueOrThrow({
    where: { id: cuentaId },
    include: { colaborador: { include: incluir }, contratoOps: { include: { colaborador: { include: incluir } } } },
  })
  const empresa = await prisma.configuracionEmpresa.findFirstOrThrow()

  // El dueño de la cuenta es el colaborador (directo) o, para OPS antiguas, el del contrato.
  const c = cuenta.colaborador ?? cuenta.contratoOps?.colaborador ?? null
  if (!c) throw new Error('La cuenta de cobro no tiene colaborador asociado.')

  const pdf = await renderCuentaCobro({
    empresa: {
      razonSocial: empresa.razonSocial, nombreComercial: empresa.nombreComercial, nit: empresa.nit,
      direccion: empresa.direccion, emailContacto: empresa.emailContacto,
    },
    contratista: {
      nombre: `${c.nombres} ${c.apellidos}`,
      tipoDocumento: c.tipoDocumento,
      numeroDocumento: c.numeroDocumento,
      lugarExpedicion: c.lugarExpedicionDoc,
      correo: c.emailPersonal ?? c.emailCorporativo,
      celular: c.celular,
      banco: c.banco?.nombre ?? null,
      tipoCuenta: c.tipoCuenta ? TIPO_CUENTA[c.tipoCuenta] ?? null : null,
      numeroCuenta: c.numeroCuenta,
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
