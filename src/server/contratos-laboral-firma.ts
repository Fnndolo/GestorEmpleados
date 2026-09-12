import 'server-only'
import { headers } from 'next/headers'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { ErrorNegocio } from '@/server/accion'
import { contextoActual } from '@/server/contexto'
import { subirArchivo } from '@/server/storage'
import { leerFirmaComoDataUri } from '@/server/contratos-ops-pdf'
import { generarPdfContratoLaboral, generarPdfAutorizacionDatosLaboral, type SnapshotContratoLaboral } from '@/server/contratos-laboral-pdf'
import { generarPdfContratoLaboralEstampado, leerDatosFirmaSubidoLaboral } from '@/server/contratos-laboral-estampar'
import { fechaLarga } from '@/lib/numero-letras'
import { avisar, avisarPorRol } from '@/server/notificaciones/avisar'

type DocFirmado = { tipo: 'CONTRATO' | 'AUTORIZACION'; documentoId: string; sha256: string }

/**
 * Aplica la firma digital de una parte (empleado o empleador) a un contrato
 * LABORAL: espejo de `aplicarFirmaContratoOps`. Guarda la imagen PNG, registra
 * fecha/usuario y, cuando ambas partes han firmado, regenera el PDF con las
 * firmas incrustadas. La autorización de datos (Ley 1581) solo requiere la firma
 * del empleado. El llamador valida permisos y pertenencia.
 */
export async function aplicarFirmaContratoLaboral(opts: {
  contratoId: string
  rol: 'EMPLEADO' | 'EMPLEADOR'
  firmaDataUri: string
  usuarioId: string
  metodoAuth?: string
}): Promise<{ firmado: boolean; numero: string }> {
  const c = await prisma.contrato.findUniqueOrThrow({ where: { id: opts.contratoId } })
  // Dos orígenes con el mismo flujo de firma pero distinto documento final: el
  // generado se regenera desde su plantilla, el subido se estampa sobre el PDF.
  const esSubido = c.origenPdf === 'SUBIDO_PARA_FIRMA'
  if (!esSubido && !c.contenidoPdf) {
    throw new ErrorNegocio('El contrato no tiene un documento generado; regenéralo antes de firmar.')
  }
  // Se valida ANTES de guardar la firma: si faltan las posiciones, el empleado
  // quedaría marcado como firmante de un documento que nunca se pudo producir.
  const datosSubido = esSubido ? leerDatosFirmaSubidoLaboral(c.posicionFirmas) : null
  // Si el PDF ya venía firmado por el empleador, su firma digital sobra: se
  // estamparía una segunda firma de la empresa sobre un documento ya firmado.
  if (opts.rol === 'EMPLEADOR' && c.firmaEmpleadorEnPdf) {
    throw new ErrorNegocio('El empleador ya firmó en el documento aportado; no hace falta su firma digital.')
  }
  const yaFirmada = opts.rol === 'EMPLEADO' ? c.firmaEmpleadoPath : c.firmaEmpleadorPath
  if (yaFirmada) throw new ErrorNegocio('Esta parte ya firmó el contrato.')

  const base64 = opts.firmaDataUri.split(',')[1] ?? ''
  const png = Buffer.from(base64, 'base64')
  if (png.byteLength === 0) throw new ErrorNegocio('La firma está vacía.')
  const archivo = await subirArchivo(`contratos/${c.id}/firmas`, `firma-${opts.rol.toLowerCase()}.png`, png, 'image/png')

  const ahora = new Date()
  const campos =
    opts.rol === 'EMPLEADO'
      ? { firmaEmpleadoPath: archivo.storagePath, firmaEmpleadoFecha: ahora, firmaEmpleadoPorId: opts.usuarioId }
      : { firmaEmpleadorPath: archivo.storagePath, firmaEmpleadorFecha: ahora, firmaEmpleadorPorId: opts.usuarioId }
  const act = await dbAuditado.contrato.update({ where: { id: c.id }, data: campos })

  // En un contrato subido el snapshot solo transporta la autorización de datos
  // (que la app sí genera desde plantilla); el contrato en sí es el PDF aportado.
  const snapshot = (act.contenidoPdf ?? {}) as unknown as SnapshotContratoLaboral
  const docs: DocFirmado[] = []

  // La autorización de datos queda firmada con la sola firma del empleado.
  if (opts.rol === 'EMPLEADO' && snapshot.autorizacion) {
    const img = await leerFirmaComoDataUri(act.firmaEmpleadoPath!)
    const r = await generarPdfAutorizacionDatosLaboral({
      contratoId: c.id,
      numero: c.numero,
      sedeId: c.sedeId,
      usuarioId: opts.usuarioId,
      datos: snapshot.autorizacion,
      firmaImg: img,
      nombreDocumento: `Autorización de datos ${c.numero} (firmada)`,
    })
    docs.push({ tipo: 'AUTORIZACION', documentoId: r.documentoId, sha256: r.sha256 })
  }

  // Si ambas partes ya firmaron —o el empleador firmó en el PDF aportado y solo
  // faltaba el empleado—, cerrar el documento y marcar FIRMADO.
  let firmado = false
  const empleadorListo = !!act.firmaEmpleadorPath || act.firmaEmpleadorEnPdf
  if (act.firmaEmpleadoPath && empleadorListo) {
    const [imgEmpleador, imgEmpleado] = await Promise.all([
      act.firmaEmpleadorPath ? leerFirmaComoDataUri(act.firmaEmpleadorPath) : Promise.resolve(null),
      leerFirmaComoDataUri(act.firmaEmpleadoPath),
    ])
    const r = datosSubido
      ? await generarPdfContratoLaboralEstampado({
          contratoId: c.id,
          numero: c.numero,
          sedeId: c.sedeId,
          usuarioId: opts.usuarioId,
          datos: datosSubido,
          firmaEmpleadoImg: imgEmpleado,
          firmaEmpleadorImg: imgEmpleador,
          nombreDocumento: `Contrato laboral ${c.numero} (firmado)`,
        })
      : await generarPdfContratoLaboral({
          contratoId: c.id,
          numero: c.numero,
          sedeId: c.sedeId,
          usuarioId: opts.usuarioId,
          datos: snapshot,
          firmas: {
            empleadorImg: imgEmpleador,
            empleadoImg: imgEmpleado,
            empleadorFecha: act.firmaEmpleadorFecha ? fechaLarga(act.firmaEmpleadorFecha.toISOString().slice(0, 10)) : null,
            empleadoFecha: act.firmaEmpleadoFecha ? fechaLarga(act.firmaEmpleadoFecha.toISOString().slice(0, 10)) : null,
          },
          nombreDocumento: `Contrato laboral ${c.numero} (firmado)`,
        })
    docs.push({ tipo: 'CONTRATO', documentoId: r.documentoId, sha256: r.sha256 })
    firmado = true
  }

  // Rastro probatorio del acto de firma (Ley 527), en BD (no dentro del PDF).
  const ctx = contextoActual()
  const userAgent = (await headers()).get('user-agent')
  await prisma.evidenciaFirmaContrato.create({
    data: {
      contratoId: c.id,
      rol: opts.rol,
      userId: opts.usuarioId,
      userEmail: ctx.userEmail,
      ip: ctx.ip,
      userAgent: userAgent ?? null,
      metodoAuth: opts.metodoAuth ?? 'SESION',
      documentos: docs,
      firmadoEn: ahora,
    },
  })

  // Avisar a la contraparte.
  const empleado = await prisma.colaborador.findUnique({
    where: { id: c.colaboradorId },
    select: { usuarioId: true, nombres: true, apellidos: true },
  })
  if (firmado) {
    const enPdf = act.firmaEmpleadorEnPdf
    const nombreEmpleado = `${empleado?.nombres ?? ''} ${empleado?.apellidos ?? ''}`.trim()
    if (empleado?.usuarioId) {
      await avisar(empleado.usuarioId, {
        titulo: 'Tu contrato quedó firmado por ambas partes',
        mensaje: enPdf
          ? `El contrato ${c.numero} ya traía la firma del representante legal y con la tuya quedó completo. Puedes descargar el PDF firmado desde tu autoservicio.`
          : `El contrato ${c.numero} ya tiene las dos firmas. Puedes descargar el PDF firmado desde tu autoservicio.`,
        enlace: '/autoservicio/contratos', llamadoAccion: 'Ver mi contrato', evento: 'contrato_firmado',
      }).catch(() => {})
    }
    await avisarPorRol(['Administrador', 'Recursos Humanos'], {
      titulo: `Contrato ${c.numero} firmado por ambas partes`,
      mensaje: enPdf
        ? `${nombreEmpleado} firmó el contrato ${c.numero}; el documento ya traía la firma del representante legal, así que quedó completo.`
        : `${nombreEmpleado} y el representante legal completaron las firmas del contrato ${c.numero}.`,
      enlace: `/contratos/${c.id}`, llamadoAccion: 'Ver el contrato', evento: 'contrato_firmado',
    }).catch(() => {})
  } else if (opts.rol === 'EMPLEADOR' && empleado?.usuarioId) {
    await avisar(empleado.usuarioId, {
      titulo: 'Tienes un contrato pendiente por firmar',
      mensaje: `El representante legal ya firmó el contrato ${c.numero}. Entra a tu autoservicio para revisarlo y firmarlo.`,
      enlace: '/autoservicio/contratos', llamadoAccion: 'Firmar mi contrato', evento: 'contrato_por_firmar',
    }).catch(() => {})
  } else if (opts.rol === 'EMPLEADO') {
    await avisarPorRol(['Administrador', 'Recursos Humanos'], {
      titulo: 'Contrato firmado por el empleado',
      mensaje: `${empleado?.nombres ?? ''} ${empleado?.apellidos ?? ''} firmó el contrato ${c.numero}. Falta la firma del representante legal para perfeccionarlo.`,
      enlace: `/contratos/${c.id}`, llamadoAccion: 'Aplicar la firma del empleador', evento: 'contrato_por_firmar',
    }).catch(() => {})
  }

  return { firmado, numero: c.numero }
}
