'use server'

import { createHash } from 'node:crypto'
import { prisma } from '@/lib/db'
import { subirArchivo } from '@/server/storage'
import { enviarCorreo } from '@/server/notificaciones/correo'

/**
 * Subida PÚBLICA del acuerdo firmado: la hace el propio aspirante, que no tiene
 * cuenta en el sistema. Por eso NO usa `accion()` (que exige sesión y permiso) y
 * valida todo por su cuenta.
 *
 * El token es lo único que autoriza, así que se comprueba en cada llamada: que
 * exista, que no haya caducado y que el acuerdo siga en evaluación. Un token
 * válido solo permite adjuntar un PDF a SU acuerdo; no lee ni cambia nada más.
 */

const MAX_BYTES = 5 * 1024 * 1024

export type ResultadoSubida = { ok: true } | { ok: false; error: string }

/**
 * Recibe FormData, no un data URI. Mandar el PDF como base64 dentro de los
 * argumentos de la Server Action reventaba la serialización de Next ("Maximum
 * array nesting exceeded") y, de paso, inflaba el archivo un 33 %. Con FormData
 * el archivo viaja como multipart, que es para lo que está hecho.
 */
export async function subirAcuerdoConToken(formData: FormData): Promise<ResultadoSubida> {
  const token = String(formData.get('token') ?? '')
  const adjunto = formData.get('archivo')

  if (!token || token.length < 20) return { ok: false, error: 'Enlace inválido.' }
  if (!(adjunto instanceof File)) return { ok: false, error: 'No llegó ningún archivo.' }

  const a = await prisma.acuerdoEvaluacion.findUnique({ where: { tokenSubida: token } })
  if (!a) return { ok: false, error: 'Este enlace no es válido.' }
  if (a.tokenExpiraEn && a.tokenExpiraEn < new Date()) {
    return { ok: false, error: 'Este enlace ya caducó. Pide uno nuevo a la empresa.' }
  }
  if (a.estado !== 'EN_EVALUACION') {
    return { ok: false, error: 'Este acuerdo ya no admite cargas.' }
  }
  if (!a.enviadoPorId) return { ok: false, error: 'El enlace no está listo. Contacta a la empresa.' }

  if (adjunto.size === 0) return { ok: false, error: 'El archivo está vacío.' }
  if (adjunto.size > MAX_BYTES) return { ok: false, error: 'El PDF supera los 5 MB.' }

  const pdf = Buffer.from(await adjunto.arrayBuffer())
  // El accept del navegador y el tipo declarado son cosméticos: cualquiera puede
  // renombrar un archivo. Lo que decide es la cabecera real.
  if (pdf.subarray(0, 5).toString('latin1') !== '%PDF-') {
    return { ok: false, error: 'El archivo debe ser un PDF.' }
  }

  const sha256 = createHash('sha256').update(pdf).digest('hex')
  const archivo = await subirArchivo(`acuerdos/${a.id}`, `${a.numero}-firmado.pdf`, pdf, 'application/pdf')

  await prisma.documento.create({
    data: {
      entidadTipo: 'AcuerdoEvaluacion',
      entidadId: a.id,
      // El nombre deja constancia de quién lo aportó: Documento.subidoPorId
      // apunta a quien envió el enlace, porque el aspirante no tiene usuario.
      nombre: `Acuerdo de evaluación ${a.numero} (firmado por el aspirante)`,
      bucket: archivo.bucket,
      storagePath: archivo.storagePath,
      mimeType: 'application/pdf',
      tamanoBytes: archivo.tamanoBytes,
      sha256,
      nivelAcceso: 'GENERAL',
      sedeId: a.sedeId,
      subidoPorId: a.enviadoPorId,
    },
  })

  await prisma.acuerdoEvaluacion.update({ where: { id: a.id }, data: { firmadoEn: new Date() } })

  // Se escribe directo (no con `auditar`) porque aquí no hay contexto de sesión:
  // la acción la ejecuta el aspirante, que no es usuario del sistema.
  await prisma.auditLog
    .create({
      data: {
        accion: 'EDITAR',
        modelo: 'AcuerdoEvaluacion',
        registroId: a.id,
        descripcion: `El aspirante ${a.nombres} ${a.apellidos} subió el acuerdo ${a.numero} firmado (enlace público)`,
      },
    })
    .catch(() => {}) // el registro de auditoría nunca debe tumbar la subida

  // Aviso a quien envió el enlace: si no, nadie se entera de que ya llegó.
  const quienEnvio = await prisma.user.findUnique({ where: { id: a.enviadoPorId }, select: { email: true, name: true } })
  if (quienEnvio?.email) {
    await enviarCorreo({
      para: quienEnvio.email,
      asunto: `Acuerdo ${a.numero} firmado — ${a.nombres} ${a.apellidos}`,
      html: `<p>Hola ${quienEnvio.name},</p>
        <p><b>${a.nombres} ${a.apellidos}</b> subió el acuerdo de evaluación <b>${a.numero}</b> firmado.</p>
        <p>Ya está adjunto en Contratación → Evaluación previa.</p>`,
    }).catch((e) => console.error('No se pudo avisar de la firma del acuerdo:', e))
  }

  return { ok: true }
}
