import 'server-only'
import { prisma } from '@/lib/db'
import { subirArchivo, leerArchivo } from '@/server/storage'
import { renderCuentaCobro } from '@/server/pdf/cuenta-cobro'
import { hoyBogota } from '@/lib/fechas'

const TIPO_CUENTA: Record<string, string> = { AHORROS: 'cuenta de ahorros', CORRIENTE: 'cuenta corriente', BILLETERA_DIGITAL: 'billetera digital' }

/** Lee el logo de la plantilla y lo devuelve como data URI (para el PDF). */
async function logoDataUri(logoPath: string | null): Promise<string | null> {
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
export async function generarPdfCuentaCobro(cuentaId: string, plantillaId: string | null, usuarioId: string): Promise<string> {
  const cuenta = await prisma.cuentaCobroOps.findUniqueOrThrow({
    where: { id: cuentaId },
    include: { contratoOps: { include: { colaborador: { include: { banco: true, sede: { include: { ciudad: true } } } } } } },
  })
  const empresa = await prisma.configuracionEmpresa.findFirstOrThrow()
  const plantilla = plantillaId
    ? await prisma.plantillaCuentaCobro.findUnique({ where: { id: plantillaId } })
    : await prisma.plantillaCuentaCobro.findFirst({ where: { esDefecto: true, activa: true } })

  const cuerpoDefecto = 'Esta cuenta de cobro corresponde a los servicios prestados según el contrato de prestación de servicios suscrito. Declaro que estoy al día en el pago de mis aportes a seguridad social como trabajador independiente.'
  const c = cuenta.contratoOps.colaborador

  const pdf = await renderCuentaCobro({
    empresa: { razonSocial: empresa.razonSocial, nombreComercial: empresa.nombreComercial, nit: empresa.nit, direccion: empresa.direccion },
    contratista: {
      nombre: `${c.nombres} ${c.apellidos}`, documento: `${c.tipoDocumento} ${c.numeroDocumento}`,
      rut: cuenta.contratoOps.rut, banco: c.banco?.nombre ?? null,
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
  })

  const archivo = await subirArchivo(`cuentas-cobro/${cuenta.contratoOpsId}`, `cuenta-cobro-${cuenta.numero}.pdf`, pdf, 'application/pdf')
  const doc = await prisma.documento.create({
    data: {
      entidadTipo: 'CuentaCobroOps', entidadId: cuenta.id, nombre: `Cuenta de cobro ${cuenta.numero}`,
      bucket: archivo.bucket, storagePath: archivo.storagePath, mimeType: 'application/pdf',
      tamanoBytes: archivo.tamanoBytes, nivelAcceso: 'GENERAL', sedeId: cuenta.contratoOps.sedeId, subidoPorId: usuarioId,
    },
  })
  await prisma.cuentaCobroOps.update({ where: { id: cuenta.id }, data: { documentoId: doc.id } })
  return doc.id
}
