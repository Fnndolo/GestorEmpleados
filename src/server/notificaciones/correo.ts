/**
 * Envío de correo con driver intercambiable:
 *  - EMAIL_DRIVER=console → imprime en consola (desarrollo)
 *  - EMAIL_DRIVER=resend  → envía con Resend (producción)
 * En F3 esto se conecta al outbox (MensajeSaliente) con dedupe y reintentos.
 */

export type Correo = {
  para: string
  asunto: string
  html: string
}

export async function enviarCorreo(correo: Correo): Promise<void> {
  if (process.env.EMAIL_DRIVER === 'resend' && process.env.RESEND_API_KEY) {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM ?? 'Smart Gadgets <onboarding@resend.dev>',
      to: correo.para,
      subject: correo.asunto,
      html: correo.html,
    })
    if (error) throw new Error(`Resend: ${error.message}`)
    return
  }
  console.log(
    `\n┌─ [correo simulado — EMAIL_DRIVER=console] ─────────────\n│ Para: ${correo.para}\n│ Asunto: ${correo.asunto}\n└──────────────────────────────────────────────────────────\n${correo.html}\n`,
  )
}
