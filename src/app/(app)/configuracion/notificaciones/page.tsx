import { requerirPermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { EVENTOS_NOTIF, CORREO_POR_DEFECTO } from '@/lib/notificaciones/catalogo'
import { ConfigNotificaciones } from './config-cliente'
import { BroadcastPrueba } from './broadcast-prueba'

export const metadata = { title: 'Notificaciones · Configuración' }

export default async function NotificacionesConfigPage() {
  await requerirPermiso('configuracion', 'VER')

  // Preferencias guardadas; sin registro para un evento = pop-up activo por defecto.
  const prefs = await prisma.preferenciaNotificacion.findMany()
  const guardadas = new Map(prefs.map((p) => [p.evento, p]))
  const popupPorEvento: Record<string, boolean> = {}
  const correoPorEvento: Record<string, boolean> = {}
  for (const e of EVENTOS_NOTIF) {
    popupPorEvento[e.clave] = guardadas.get(e.clave)?.popup ?? true
    correoPorEvento[e.clave] = guardadas.get(e.clave)?.correo ?? CORREO_POR_DEFECTO.has(e.clave)
  }

  return (
    <div className="max-w-5xl">
      <Encabezado
        titulo="Notificaciones"
        descripcion="Todos los eventos llegan a la campana y al celular. Aquí decides cuáles además muestran un pop-up y cuáles mandan correo. El correo viene apagado en todos: enciéndelo solo donde haga falta. Por correo salen siempre los códigos de firma, las contraseñas y lo que va al aspirante de una evaluación previa."
      />
      <div className="mb-6">
        <BroadcastPrueba />
      </div>

      <ConfigNotificaciones popupPorEvento={popupPorEvento} correoPorEvento={correoPorEvento} />
    </div>
  )
}
