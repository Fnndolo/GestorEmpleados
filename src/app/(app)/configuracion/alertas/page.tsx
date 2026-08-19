import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { ReglasAlertaCliente } from './reglas-cliente'

export const metadata = { title: 'Reglas de alerta · Configuración' }

export default async function AlertasConfigPage() {
  const usuario = await requerirPermiso('configuracion', 'VER')
  const puedeCrear = tienePermiso(usuario, 'configuracion', 'CREAR')
  const puedeEditar = tienePermiso(usuario, 'configuracion', 'EDITAR')
  const puedeEliminar = tienePermiso(usuario, 'configuracion', 'ELIMINAR')
  const reglas = await prisma.reglaAlerta.findMany({ orderBy: { clave: 'asc' } })

  return (
    <div className="max-w-5xl">
      <Encabezado
        titulo="Reglas de alerta"
        descripcion="Con cuánta anticipación avisa cada tipo de vencimiento. La regla global aplica a todo lo que no tenga la suya propia."
      />
      <ReglasAlertaCliente
        reglas={reglas.map((r) => ({
          id: r.id, clave: r.clave, descripcion: r.descripcion,
          diasPrimeraAlerta: r.diasPrimeraAlerta, primeraEnHabiles: r.primeraEnHabiles,
          diasUltimaAlerta: r.diasUltimaAlerta, ultimaEnHabiles: r.ultimaEnHabiles,
        }))}
        puedeCrear={puedeCrear}
        puedeEditar={puedeEditar}
        puedeEliminar={puedeEliminar}
      />
    </div>
  )
}
