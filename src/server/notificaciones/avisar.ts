import 'server-only'
import { prisma } from '@/lib/db'
import { enviarCorreo } from '@/server/notificaciones/correo'

/** Date.now() de forma segura (en algunos runtimes restringidos se evita). */
function ahora(): number {
  return Date.now()
}

/**
 * Crea una notificación in-app para un usuario. `dedupeKey` evita duplicados;
 * si no se pasa, se genera una única basada en el momento (siempre nueva).
 */
export async function notificarUsuario(
  userId: string,
  titulo: string,
  mensaje: string,
  enlace?: string,
  dedupeKey?: string,
): Promise<void> {
  const key = dedupeKey ?? `aviso:${userId}:${titulo}:${ahora()}`
  try {
    await prisma.notificacion.create({
      data: { userId, titulo, mensaje, enlace: enlace ?? null, dedupeKey: key },
    })
  } catch {
    /* dedupeKey duplicado → ya existe, idempotente */
  }
}

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

function plantillaCorreo(nombre: string, titulo: string, mensaje: string, enlace?: string, llamado?: string): string {
  const url = enlace ? `${APP_URL()}${enlace}` : APP_URL()
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1e293b">
      <div style="background:#0f172a;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0">
        <strong style="font-size:16px">Smart Gadgets · Gestión Humana</strong>
      </div>
      <div style="border:1px solid #e2e8f0;border-top:none;padding:20px;border-radius:0 0 8px 8px">
        <p>Hola ${nombre},</p>
        <p style="font-size:15px"><strong>${titulo}</strong></p>
        <p>${mensaje}</p>
        <p style="margin:20px 0">
          <a href="${url}" style="background:#4f46e5;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;display:inline-block;font-weight:bold">
            ${llamado ?? 'Entrar a la plataforma'}
          </a>
        </p>
        <p style="font-size:12px;color:#64748b">Si el botón no funciona, copia este enlace: ${url}</p>
      </div>
    </div>`
}

/**
 * Avisa a un usuario por la app Y por correo. Pensado para flujos interactivos
 * (solicitudes, disciplinarios, cuentas de cobro) donde el aviso debe ser inmediato.
 * El correo se registra en el outbox (idempotente) y se intenta enviar al momento.
 */
export async function avisar(
  userId: string,
  opts: { titulo: string; mensaje: string; enlace?: string; llamadoAccion?: string },
): Promise<void> {
  const usuario = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } })
  if (!usuario) return

  await notificarUsuario(userId, opts.titulo, opts.mensaje, opts.enlace)

  const dedupe = `mail:aviso:${userId}:${opts.titulo}:${ahora()}`
  const cuerpo = plantillaCorreo(usuario.name, opts.titulo, opts.mensaje, opts.enlace, opts.llamadoAccion)
  try {
    const msg = await prisma.mensajeSaliente.create({
      data: { canal: 'EMAIL', destino: usuario.email, asunto: `[Smart Gadgets] ${opts.titulo}`, cuerpo, dedupeKey: dedupe },
    })
    // Envío inmediato best-effort; si falla, el cron de outbox lo reintenta
    try {
      await enviarCorreo({ para: usuario.email, asunto: `[Smart Gadgets] ${opts.titulo}`, html: cuerpo })
      await prisma.mensajeSaliente.update({ where: { id: msg.id }, data: { estado: 'ENVIADO', enviadoEn: new Date(), intentos: 1 } })
    } catch {
      /* queda EN_COLA para el cron */
    }
  } catch {
    /* dedupe duplicado */
  }
}

/** Avisa a todos los usuarios activos con uno de los roles indicados (in-app + correo). */
export async function avisarPorRol(
  roles: string[],
  opts: { titulo: string; mensaje: string; enlace?: string; llamadoAccion?: string },
): Promise<void> {
  const usuarios = await prisma.user.findMany({
    where: { estado: 'ACTIVO', rol: { nombre: { in: roles } } },
    select: { id: true },
  })
  for (const u of usuarios) await avisar(u.id, opts)
}

/** Devuelve el userId vinculado a un colaborador (o null). */
export async function usuarioDeColaborador(colaboradorId: string): Promise<string | null> {
  const c = await prisma.colaborador.findUnique({ where: { id: colaboradorId }, select: { usuarioId: true } })
  return c?.usuarioId ?? null
}
