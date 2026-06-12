import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { ReglasAlertaCliente } from './reglas-cliente'

export const metadata = { title: 'Reglas de alerta · Configuración' }

export default async function AlertasConfigPage() {
  const usuario = await requerirPermiso('configuracion', 'VER')
  const puedeEditar = tienePermiso(usuario, 'configuracion', 'EDITAR')
  const reglas = await prisma.reglaAlerta.findMany({ orderBy: { clave: 'asc' } })

  return (
    <div className="mx-auto max-w-3xl">
      <Encabezado
        titulo="Reglas de alerta"
        descripcion="Días de anticipación de las alertas de vencimiento. La regla GLOBAL aplica salvo que un tipo tenga la suya."
      />
      <ReglasAlertaCliente
        reglas={reglas.map((r) => ({
          id: r.id, clave: r.clave, descripcion: r.descripcion,
          diasPrimeraAlerta: r.diasPrimeraAlerta, primeraEnHabiles: r.primeraEnHabiles,
          diasUltimaAlerta: r.diasUltimaAlerta, ultimaEnHabiles: r.ultimaEnHabiles,
        }))}
        puedeEditar={puedeEditar}
      />
    </div>
  )
}
