import 'server-only'
import { createHash, randomInt } from 'node:crypto'
import type { PropositoCodigoFirma } from '@/generated/prisma/client'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { ErrorNegocio } from '@/server/accion'
import { contextoActual } from '@/server/contexto'
import { enviarCorreo } from '@/server/notificaciones/correo'

/**
 * Código de un solo uso (OTP) enviado por correo para autorizar una firma
 * electrónica en autoservicio. Deja huella del consentimiento previo (Ley 527):
 * antes de firmar, la persona confirma que recibió el código en su correo.
 *
 * En desarrollo (EMAIL_DRIVER=console) el código se imprime en la terminal.
 */

const LONGITUD = 6
const VIGENCIA_MIN = 10
const MAX_INTENTOS = 5

/** Hash del código con sal por-fila para no guardarlo en texto plano. */
function hashCodigo(codigo: string, sal: string): string {
  return createHash('sha256').update(`${sal}:${codigo}`).digest('hex')
}

/** Oculta el correo para mostrarlo en la UI: " juan@gmail.com" → "j••••@gmail.com". */
export function enmascararCorreo(email: string): string {
  const [usuario, dominio] = email.split('@')
  if (!dominio) return email
  const visible = usuario.slice(0, 1)
  return `${visible}${'•'.repeat(Math.max(usuario.length - 1, 1))}@${dominio}`
}

function plantillaCorreo(codigo: string, minutos: number): string {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#1e293b">
    <h2 style="color:#1f3864;margin:0 0 8px">Código para autorizar tu firma</h2>
    <p style="margin:0 0 16px;line-height:1.5">
      Estás a punto de firmar electrónicamente en la plataforma de <b>KUPOCELL S.A.S.</b>
      Ingresa este código en la app para confirmar que autorizas la firma:
    </p>
    <div style="font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;
                background:#eef2f7;border:1px solid #d7dfea;border-radius:10px;padding:16px 0;color:#1f3864">
      ${codigo}
    </div>
    <p style="margin:16px 0 0;font-size:13px;color:#64748b;line-height:1.5">
      El código vence en ${minutos} minutos. Si no solicitaste firmar, ignora este correo:
      sin este código nadie puede firmar en tu nombre.
    </p>
  </div>`
}

/**
 * Genera un código de 6 dígitos, lo guarda (hasheado) e invalida los anteriores
 * del mismo (usuario, propósito, referencia). Envía el código por correo y
 * devuelve el correo enmascarado para mostrarlo en la UI.
 */
export async function generarYEnviarCodigoFirma(opts: {
  proposito: PropositoCodigoFirma
  referenciaId: string
  userId: string
  email: string
}): Promise<{ email: string; vigenciaMin: number }> {
  if (!opts.email) throw new ErrorNegocio('Tu usuario no tiene un correo configurado para enviar el código.')

  const codigo = String(randomInt(0, 10 ** LONGITUD)).padStart(LONGITUD, '0')
  const ip = contextoActual().ip
  const expiraEn = new Date(Date.now() + VIGENCIA_MIN * 60_000)

  // Invalida cualquier código previo sin usar de esta misma firma (solo el último vale).
  await prisma.codigoFirma.updateMany({
    where: { userId: opts.userId, proposito: opts.proposito, referenciaId: opts.referenciaId, usadoEn: null },
    data: { usadoEn: new Date() },
  })

  await dbAuditado.codigoFirma.create({
    data: {
      proposito: opts.proposito,
      referenciaId: opts.referenciaId,
      userId: opts.userId,
      email: opts.email,
      codigoHash: hashCodigo(codigo, `${opts.referenciaId}:${opts.userId}`),
      expiraEn,
      ip,
    },
  })

  await enviarCorreo({
    para: opts.email,
    asunto: 'Código para autorizar tu firma — Smart Gadgets',
    html: plantillaCorreo(codigo, VIGENCIA_MIN),
  })

  return { email: enmascararCorreo(opts.email), vigenciaMin: VIGENCIA_MIN }
}

/**
 * Verifica el código de firma vigente. Lo marca como usado si es correcto.
 * Lanza ErrorNegocio con un mensaje claro si es incorrecto, venció o se agotaron
 * los intentos. No revela el código correcto ni cuántos dígitos coinciden.
 */
export async function verificarCodigoFirma(opts: {
  proposito: PropositoCodigoFirma
  referenciaId: string
  userId: string
  codigo: string
}): Promise<void> {
  const registro = await prisma.codigoFirma.findFirst({
    where: { userId: opts.userId, proposito: opts.proposito, referenciaId: opts.referenciaId, usadoEn: null },
    orderBy: { creadoEn: 'desc' },
  })

  if (!registro) {
    throw new ErrorNegocio('No hay un código activo. Solicita uno nuevo a tu correo.')
  }
  if (registro.expiraEn.getTime() < Date.now()) {
    throw new ErrorNegocio('El código venció. Solicita uno nuevo a tu correo.')
  }
  if (registro.intentos >= MAX_INTENTOS) {
    throw new ErrorNegocio('Demasiados intentos. Solicita un código nuevo a tu correo.')
  }

  const esperado = hashCodigo(opts.codigo.trim(), `${opts.referenciaId}:${opts.userId}`)
  if (esperado !== registro.codigoHash) {
    await dbAuditado.codigoFirma.update({ where: { id: registro.id }, data: { intentos: { increment: 1 } } })
    const restantes = MAX_INTENTOS - registro.intentos - 1
    throw new ErrorNegocio(
      restantes > 0
        ? `Código incorrecto. Te quedan ${restantes} ${restantes === 1 ? 'intento' : 'intentos'}.`
        : 'Código incorrecto. Se agotaron los intentos; solicita un código nuevo.',
    )
  }

  // Correcto: se consume para que no se pueda reutilizar.
  await dbAuditado.codigoFirma.update({ where: { id: registro.id }, data: { usadoEn: new Date() } })
}
