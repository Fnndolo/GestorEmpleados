import 'server-only'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { subirArchivo } from '@/server/storage'
import { renderCertificacion, type DatosCertificacion } from '@/server/pdf/certificacion'
import { hoyBogota } from '@/lib/fechas'

/**
 * Genera el PDF de una certificación laboral, lo guarda como Documento y crea
 * el registro CertificacionLaboral. Devuelve el id del documento (para descarga).
 */
export async function generarCertificacion(opts: {
  colaboradorId: string
  tipo: DatosCertificacion['tipo']
  dirigidaA?: string | null
  generadoPorId: string
  firmaDataUri?: string | null
}): Promise<{ certificacionId: string; documentoId: string }> {
  const colab = await prisma.colaborador.findUniqueOrThrow({
    where: { id: opts.colaboradorId },
    include: { cargo: true, sede: { include: { ciudad: true } } },
  })
  const empresa = await prisma.configuracionEmpresa.findFirstOrThrow()
  const contrato = await prisma.contrato.findFirst({
    where: { colaboradorId: opts.colaboradorId, estado: 'ACTIVO' },
    orderBy: { fechaInicio: 'desc' },
  })

  const datos: DatosCertificacion = {
    tipo: opts.tipo,
    dirigidaA: opts.dirigidaA ?? null,
    empresa: {
      razonSocial: empresa.razonSocial,
      nombreComercial: empresa.nombreComercial,
      nit: empresa.nit,
      direccion: empresa.direccion,
      telefono: empresa.telefono,
      emailContacto: empresa.emailContacto,
    },
    colaborador: {
      nombres: colab.nombres,
      apellidos: colab.apellidos,
      tipoDocumento: colab.tipoDocumento,
      numeroDocumento: colab.numeroDocumento,
      cargo: colab.cargo?.nombre ?? null,
      funciones: colab.cargo?.funciones ?? null,
      tipoVinculo: colab.tipoVinculo,
      fechaIngreso: colab.fechaIngreso,
      salario: contrato ? Number(contrato.salarioBase) : null,
    },
    ciudad: colab.sede.ciudad.nombre,
    fecha: hoyBogota(),
    firmaDataUri: opts.firmaDataUri ?? null,
  }

  const pdf = await renderCertificacion(datos)
  const archivo = await subirArchivo(
    `colaborador/${colab.id}/certificaciones`,
    `certificacion-${colab.numeroDocumento}.pdf`,
    pdf,
    'application/pdf',
  )

  const doc = await dbAuditado.documento.create({
    data: {
      entidadTipo: 'Colaborador',
      entidadId: colab.id,
      nombre: `Certificación laboral (${opts.tipo})`,
      bucket: archivo.bucket,
      storagePath: archivo.storagePath,
      mimeType: 'application/pdf',
      tamanoBytes: archivo.tamanoBytes,
      nivelAcceso: 'GENERAL',
      sedeId: colab.sedeId,
      subidoPorId: opts.generadoPorId,
    },
  })

  const cert = await dbAuditado.certificacionLaboral.create({
    data: {
      colaboradorId: colab.id,
      tipo: opts.tipo,
      dirigidaA: opts.dirigidaA ?? null,
      estado: 'GENERADA',
      documentoId: doc.id,
      generadoPorId: opts.generadoPorId,
    },
  })

  return { certificacionId: cert.id, documentoId: doc.id }
}
