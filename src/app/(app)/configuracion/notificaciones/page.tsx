import { requerirPermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { EVENTOS_NOTIF } from '@/lib/notificaciones/catalogo'
import { ConfigNotificaciones } from './config-cliente'
import { BroadcastPrueba } from './broadcast-prueba'

export const metadata = { title: 'Notificaciones · Configuración' }

export default async function NotificacionesConfigPage() {
  await requerirPermiso('configuracion', 'VER')

  // Preferencias guardadas; sin registro para un evento = pop-up activo por defecto.
  const prefs = await prisma.preferenciaNotificacion.findMany()
  const guardadas = new Map(prefs.map((p) => [p.evento, p.popup]))
  const popupPorEvento: Record<string, boolean> = {}
  for (const e of EVENTOS_NOTIF) popupPorEvento[e.clave] = guardadas.get(e.clave) ?? true

  return (
    <div className="mx-auto max-w-3xl">
      <Encabezado
        titulo="Notificaciones"
        descripcion="Elige qué eventos muestran un pop-up (aviso emergente) en pantalla. Los avisos que apagues aquí igual llegan a la campana, el correo y el celular; solo se omite el pop-up."
      />
      <div className="mb-6">
        <BroadcastPrueba />
      </div>

      <ConfigNotificaciones popupPorEvento={popupPorEvento} />
    </div>
  )
}
