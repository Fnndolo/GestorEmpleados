import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { admin } from 'better-auth/plugins'
import { nextCookies } from 'better-auth/next-js'
import { prisma } from '@/lib/db'
import { enviarCorreo } from '@/server/notificaciones/correo'

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  // Orígenes adicionales permitidos (ej. túnel HTTPS para probar en el celular):
  // BETTER_AUTH_TRUSTED_ORIGINS="https://xxxx.devtunnels.ms,https://otro.com"
  trustedOrigins: process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean),
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  emailAndPassword: {
    enabled: true,
    // Los usuarios solo los crea el Administrador (no hay auto-registro)
    disableSignUp: true,
    sendResetPassword: async ({ user, url }) => {
      await enviarCorreo({
        para: user.email,
        asunto: 'Restablecer contraseña — Plataforma Smart Gadgets',
        html: `<p>Hola ${user.name},</p><p>Para restablecer tu contraseña haz clic en el siguiente enlace (válido por 1 hora):</p><p><a href="${url}">Restablecer contraseña</a></p><p>Si no solicitaste este cambio, ignora este correo.</p>`,
      })
    },
  },
  user: {
    additionalFields: {
      rolId: { type: 'string', required: true, input: true },
      estado: { type: 'string', required: false, input: true },
      debeCambiarPassword: { type: 'boolean', required: false, input: true },
      telefonoE164: { type: 'string', required: false, input: true },
      whatsappOptIn: { type: 'boolean', required: false, input: true },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 días
    updateAge: 60 * 60 * 24,
  },
  advanced: {
    database: {
      // Los IDs los genera PostgreSQL (uuid v7 por @default en el esquema)
      generateId: false,
    },
  },
  plugins: [admin(), nextCookies()],
})

export type Sesion = typeof auth.$Infer.Session
