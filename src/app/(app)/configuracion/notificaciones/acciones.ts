'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { accion } from '@/server/accion'
import { dbAuditado } from '@/lib/auditoria'
import { avisarBroadcast } from '@/server/notificaciones/avisar'
import { esEventoValido } from '@/lib/notificaciones/catalogo'

/**
 * Activa o desactiva el pop-up (toast) de un evento. Config global que fija el
 * administrador. Solo afecta el pop-up: el aviso igual llega a la campana y al
 * push, y el correo se decide aparte con .
 */
export const configurarPopupEvento = accion(
  {
    modulo: 'configuracion',
    accion: 'EDITAR',
    schema: z.object({
      evento: z.string().refine(esEventoValido, 'Evento desconocido'),
      popup: z.boolean(),
    }),
  },
  async (d) => {
    await dbAuditado.preferenciaNotificacion.upsert({
      where: { evento: d.evento },
      create: { evento: d.evento, popup: d.popup },
      update: { popup: d.popup },
    })
    revalidatePath('/configuracion/notificaciones')
    return { ok: true }
  },
)

/**
 * Activa o desactiva el CORREO de un evento.
 *
 * Separado del pop-up porque son molestias de distinto orden: el pop-up estorba
 * un segundo, el correo se queda en la bandeja. Lo que se apaga aquí sigue
 * llegando a la campana y al celular.
 */
export const configurarCorreoEvento = accion(
  {
    modulo: 'configuracion',
    accion: 'EDITAR',
    schema: z.object({
      evento: z.string().refine(esEventoValido, 'Evento desconocido'),
      correo: z.boolean(),
    }),
  },
  async (d) => {
    await dbAuditado.preferenciaNotificacion.upsert({
      where: { evento: d.evento },
      // Sin fila previa, el pop-up conserva su valor por defecto (activo).
      create: { evento: d.evento, popup: true, correo: d.correo },
      update: { correo: d.correo },
    })
    revalidatePath('/configuracion/notificaciones')
    return { ok: true }
  },
)

/**
 * Envía un aviso de prueba a TODOS los empleados activos (in-app + push, sin correo).
 * Útil para verificar que las notificaciones — sobre todo el push del celular —
 * llegan bien. Requiere permiso de configuración (administrador).
 */
export const enviarAvisoBroadcast = accion(
  {
    modulo: 'configuracion',
    accion: 'EDITAR',
    schema: z.object({
      titulo: z.string().trim().min(2, 'Escribe un título.').max(120),
      mensaje: z.string().trim().min(2, 'Escribe un mensaje.').max(400),
    }),
  },
  async (d) => {
    const { total } = await avisarBroadcast({ titulo: d.titulo, mensaje: d.mensaje, enlace: '/inicio' })
    return { ok: true, total }
  },
)
