import { redirect } from 'next/navigation'
import { requerirPermiso } from '@/server/sesion'
import { esAdministrador } from '@/lib/permisos/tipos'
import { conexionAsistencia } from '@/server/asistencia/cliente'
import { prisma } from '@/lib/db'
import { CAMPO_COMPARTIDO, DATOS_COMPARTIDOS } from '@/lib/integraciones'
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
  const config = await prisma.configuracionEmpresa.findFirst()
  const compartidos = Object.fromEntries(DATOS_COMPARTIDOS.map((d) => [d.clave, config?.[CAMPO_COMPARTIDO[d.clave]] ?? true]))

  return (
    <div>
      <Encabezado enLinea titulo="Integraciones" ayuda="Conexiones con otros sistemas. Solo el administrador las ve y las cambia." />
      <TarjetaAsistencia conectada={Boolean(conexion)} url={conexion?.url ?? null} compartidos={compartidos} />
    </div>
  )
}
