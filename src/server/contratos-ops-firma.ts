import 'server-only'
import { headers } from 'next/headers'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { ErrorNegocio } from '@/server/accion'
import { contextoActual } from '@/server/contexto'
import { subirArchivo } from '@/server/storage'
import { generarPdfContratoOps, generarPdfAutorizacionDatos, leerFirmaComoDataUri, type SnapshotContratoOps } from '@/server/contratos-ops-pdf'
import { fechaLarga } from '@/lib/numero-letras'
import { avisar, avisarPorRol } from '@/server/notificaciones/avisar'

type DocFirmado = { tipo: 'CONTRATO' | 'AUTORIZACION'; documentoId: string; sha256: string }

/**
 * Aplica la firma digital de una parte (contratista o contratante) a un contrato
 * OPS: guarda la imagen PNG en storage, registra fecha/usuario y, cuando ambas
 * partes han firmado, regenera el PDF con las firmas incrustadas y marca el
 * contrato como FIRMADO. La autorización de datos (Ley 1581) solo requiere la
 * firma del contratista: se regenera firmada en cuanto él firma.
 * Compartido por la acción de administración y la de autoservicio (el llamador
 * valida permisos y pertenencia).
 */
export async function aplicarFirmaContratoOps(opts: {
  contratoId: string
  rol: 'CONTRATISTA' | 'CONTRATANTE'
  firmaDataUri: string
  usuarioId: string
  // Método con que se autenticó el firmante para la evidencia (Ley 527).
  // 'SESION' (por defecto) o 'CODIGO_EMAIL' si se validó un OTP enviado al correo.
  metodoAuth?: string
}): Promise<{ firmado: boolean; numero: string }> {
  const c = await prisma.contratoOps.findUniqueOrThrow({ where: { id: opts.contratoId } })
  if (!c.contenidoPdf) {
    throw new ErrorNegocio('El contrato no tiene un documento generado; regenéralo antes de firmar.')
  }
  const yaFirmada = opts.rol === 'CONTRATISTA' ? c.firmaContratistaPath : c.firmaContratantePath
  if (yaFirmada) throw new ErrorNegocio('Esta parte ya firmó el contrato.')

  // La firma llega como data URI PNG; se guarda como archivo en storage.
  const base64 = opts.firmaDataUri.split(',')[1] ?? ''
  const png = Buffer.from(base64, 'base64')
  if (png.byteLength === 0) throw new ErrorNegocio('La firma está vacía.')
  const archivo = await subirArchivo(`contratos-ops/${c.id}/firmas`, `firma-${opts.rol.toLowerCase()}.png`, png, 'image/png')

  const ahora = new Date()
  const campos =
    opts.rol === 'CONTRATISTA'
      ? { firmaContratistaPath: archivo.storagePath, firmaContratistaFecha: ahora, firmaContratistaPorId: opts.usuarioId }
      : { firmaContratantePath: archivo.storagePath, firmaContratanteFecha: ahora, firmaContratantePorId: opts.usuarioId }
  const act = await dbAuditado.contratoOps.update({ where: { id: c.id }, data: campos })

  const snapshot = act.contenidoPdf as unknown as SnapshotContratoOps
  const docs: DocFirmado[] = []

  // La autorización de datos queda firmada con la sola firma del contratista.
  if (opts.rol === 'CONTRATISTA' && snapshot.autorizacion) {
    const img = await leerFirmaComoDataUri(act.firmaContratistaPath!)
    const r = await generarPdfAutorizacionDatos({
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

  // Si ambas partes ya firmaron, regenerar el PDF del contrato y marcar FIRMADO.
  let firmado = false
  if (act.firmaContratistaPath && act.firmaContratantePath) {
    const [imgContratante, imgContratista] = await Promise.all([
      leerFirmaComoDataUri(act.firmaContratantePath),
      leerFirmaComoDataUri(act.firmaContratistaPath),
    ])
    const r = await generarPdfContratoOps({
      contratoId: c.id,
      numero: c.numero,
      sedeId: c.sedeId,
      usuarioId: opts.usuarioId,
      datos: snapshot,
      firmas: {
        contratanteImg: imgContratante,
        contratistaImg: imgContratista,
        contratanteFecha: act.firmaContratanteFecha ? fechaLarga(act.firmaContratanteFecha.toISOString().slice(0, 10)) : null,
        contratistaFecha: act.firmaContratistaFecha ? fechaLarga(act.firmaContratistaFecha.toISOString().slice(0, 10)) : null,
      },
      nombreDocumento: `Contrato OPS ${c.numero} (firmado)`,
    })
    docs.push({ tipo: 'CONTRATO', documentoId: r.documentoId, sha256: r.sha256 })
    await dbAuditado.contratoOps.update({ where: { id: c.id }, data: { estado: 'FIRMADO' } })
    firmado = true
  }

  // Rastro probatorio del acto de firma (Ley 527): quién, cuándo, desde dónde y con
  // qué huella de documento. Se guarda en BD, no dentro del PDF.
  const ctx = contextoActual()
  const userAgent = (await headers()).get('user-agent')
  await prisma.evidenciaFirmaContrato.create({
    data: {
      contratoOpsId: c.id,
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

  // Avisar a la contraparte: firmar no sirve de nada si el otro no se entera.
  const contratista = await prisma.colaborador.findUnique({
    where: { id: c.colaboradorId },
    select: { usuarioId: true, nombres: true, apellidos: true },
  })
  if (firmado) {
    // Ambas partes firmaron: contrato perfeccionado, avisar a ambos lados.
    if (contratista?.usuarioId) {
      await avisar(contratista.usuarioId, {
        titulo: 'Tu contrato quedó firmado por ambas partes',
        mensaje: `El contrato ${c.numero} ya tiene las dos firmas. Puedes descargar el PDF firmado desde tu autoservicio.`,
        enlace: '/autoservicio/contratos', llamadoAccion: 'Ver mi contrato', evento: 'contrato_firmado',
      }).catch(() => {})
    }
    await avisarPorRol(['Administrador', 'Recursos Humanos'], {
      titulo: `Contrato ${c.numero} firmado por ambas partes`,
      mensaje: `${contratista?.nombres ?? ''} ${contratista?.apellidos ?? ''} y el representante legal completaron las firmas del contrato ${c.numero}.`,
      enlace: `/contratos/ops/${c.id}`, llamadoAccion: 'Ver el contrato', evento: 'contrato_firmado',
    }).catch(() => {})
  } else if (opts.rol === 'CONTRATANTE' && contratista?.usuarioId) {
    // Firmó la empresa: el contratista debe entrar a firmar.
    await avisar(contratista.usuarioId, {
      titulo: 'Tienes un contrato pendiente por firmar',
      mensaje: `El representante legal ya firmó el contrato ${c.numero}. Entra a tu autoservicio para revisarlo y firmarlo.`,
      enlace: '/autoservicio/contratos', llamadoAccion: 'Firmar mi contrato', evento: 'contrato_por_firmar',
    }).catch(() => {})
  } else if (opts.rol === 'CONTRATISTA') {
    // Firmó el contratista: falta la firma del representante legal.
    await avisarPorRol(['Administrador', 'Recursos Humanos'], {
      titulo: 'Contrato firmado por el contratista',
      mensaje: `${contratista?.nombres ?? ''} ${contratista?.apellidos ?? ''} firmó el contrato ${c.numero}. Falta la firma del representante legal para perfeccionarlo.`,
      enlace: `/contratos/ops/${c.id}`, llamadoAccion: 'Aplicar la firma del contratante', evento: 'contrato_por_firmar',
    }).catch(() => {})
  }

  return { firmado, numero: c.numero }
}
