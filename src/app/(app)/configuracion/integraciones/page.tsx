import { redirect } from 'next/navigation'
import { requerirPermiso } from '@/server/sesion'
import { esAdministrador } from '@/lib/permisos/tipos'
import { conexionAsistencia } from '@/server/asistencia/cliente'
import { Encabezado } from '@/components/shell/encabezado'
import { TarjetaAsistencia } from './tarjeta-asistencia'

export const metadata = { title: 'Integraciones · Configuración' }

/**
 * Conexiones con otros sistemas. Solo la ve el administrador: aquí viven las
 * claves con las que la plataforma habla en nombre de la empresa.
 */
export default async function IntegracionesPage() {
  const usuario = await requerirPermiso('configuracion', 'VER')
  if (!esAdministrador(usuario)) redirect('/configuracion/empresa')
  const conexion = await conexionAsistencia()

  return (
    <div className="max-w-3xl">
      <Encabezado enLinea titulo="Integraciones" />
      <TarjetaAsistencia conectada={Boolean(conexion)} url={conexion?.url ?? null} />
    </div>
  )
}
