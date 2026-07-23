import 'server-only'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { subirArchivo } from '@/server/storage'
import { renderActaEpp } from '@/server/pdf/acta-epp'

/**
 * Genera (o regenera con firma) el PDF de la constancia de entrega de EPP
 * (Decreto 1072/2015, art. 2.2.4.6.24) y lo guarda en el expediente del
 * colaborador, actualizando el puntero de la entrega. Devuelve el id del documento.
 */
export async function generarRecibidoEpp(
  entregaId: string,
  usuarioId: string,
  firma?: { dataUri: string; fecha: Date },
): Promise<string> {
  const entrega = await prisma.entregaEpp.findUniqueOrThrow({
    where: { id: entregaId },
    include: {
      elementoEpp: true,
      colaborador: { include: { cargo: true, sede: { include: { ciudad: true } } } },
    },
  })
  const empresa = await prisma.configuracionEmpresa.findFirstOrThrow()
  const colab = entrega.colaborador

  const pdf = await renderActaEpp({
    empresa: {
      razonSocial: empresa.razonSocial, nombreComercial: empresa.nombreComercial, nit: empresa.nit,
      direccion: empresa.direccion, telefono: empresa.telefono, emailContacto: empresa.emailContacto,
    },
    colaborador: { nombre: `${colab.nombres} ${colab.apellidos}`, documento: colab.numeroDocumento, cargo: colab.cargo?.nombre ?? null },
    elemento: entrega.elementoEpp.nombre,
    cantidad: entrega.cantidad,
    reposicion: entrega.reposicion,
    ciudad: colab.sede.ciudad.nombre,
    fecha: entrega.fechaEntrega,
    firmaDataUri: firma?.dataUri ?? null,
    firmaFecha: firma?.fecha ?? null,
  })

  const archivo = await subirArchivo(`epp/${entrega.colaboradorId}`, `recibido-epp-${entregaId}${firma ? '-firmado' : ''}.pdf`, pdf, 'application/pdf')
  const doc = await prisma.documento.create({
    data: {
      entidadTipo: 'Colaborador', entidadId: entrega.colaboradorId,
      nombre: `Recibido EPP — ${entrega.elementoEpp.nombre}${firma ? ' (firmado)' : ''}`,
      bucket: archivo.bucket, storagePath: archivo.storagePath, mimeType: 'application/pdf',
      tamanoBytes: archivo.tamanoBytes, nivelAcceso: 'GENERAL', sedeId: colab.sedeId, subidoPorId: usuarioId,
    },
  })
  await dbAuditado.entregaEpp.update({
    where: { id: entregaId },
    data: { soporteDocId: doc.id, ...(firma ? { firmadoEn: firma.fecha } : {}) },
  })
  return doc.id
}
