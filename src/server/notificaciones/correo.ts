/**
 * Envío de correo con driver intercambiable (variable EMAIL_DRIVER):
 *  - console → imprime en consola (desarrollo, no envía)
 *  - smtp    → envía por SMTP con nodemailer (p. ej. Gmail con contraseña de aplicación)
 *  - resend  → envía con Resend (requiere dominio verificado)
 */

/** Archivo adjunto (p. ej. el PDF de un acuerdo que el destinatario debe firmar). */
export type Adjunto = {
  nombre: string
  contenido: Buffer
  tipo?: string
}

export type Correo = {
  para: string
  asunto: string
  html: string
  adjuntos?: Adjunto[]
}

const FROM_DEFECTO = 'Smart Gadgets <onboarding@resend.dev>'

export async function enviarCorreo(correo: Correo): Promise<void> {
  const driver = process.env.EMAIL_DRIVER

  // ── SMTP (Gmail u otro) ──────────────────────────────────────────────────
  if (driver === 'smtp' && process.env.SMTP_HOST && process.env.SMTP_USER) {
    const nodemailer = (await import('nodemailer')).default
    const puerto = Number(process.env.SMTP_PORT ?? 465)
    const transporte = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: puerto,
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : puerto === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
    await transporte.sendMail({
      from: process.env.EMAIL_FROM ?? process.env.SMTP_USER,
      to: correo.para,
      subject: correo.asunto,
      html: correo.html,
      attachments: correo.adjuntos?.map((a) => ({ filename: a.nombre, content: a.contenido, contentType: a.tipo ?? 'application/pdf' })),
    })
    return
  }

  // ── Resend ───────────────────────────────────────────────────────────────
  if (driver === 'resend' && process.env.RESEND_API_KEY) {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM ?? FROM_DEFECTO,
      to: correo.para,
      subject: correo.asunto,
      html: correo.html,
      attachments: correo.adjuntos?.map((a) => ({ filename: a.nombre, content: a.contenido })),
    })
    if (error) throw new Error(`Resend: ${error.message}`)
    return
  }

  // ── Consola (desarrollo) ─────────────────────────────────────────────────
  console.log(
    `\n┌─ [correo simulado — EMAIL_DRIVER=${driver ?? 'console'}] ─────────────\n│ Para: ${correo.para}\n│ Asunto: ${correo.asunto}\n│ Adjuntos: ${correo.adjuntos?.map((a) => a.nombre).join(', ') ?? 'ninguno'}\n└──────────────────────────────────────────────────────────\n${correo.html}\n`,
  )
}
