import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { CargosCliente } from './cargos-cliente'

export const metadata = { title: 'Cargos · Configuración' }

export default async function CargosPage() {
  const usuario = await requerirPermiso('configuracion', 'VER')
  const puedeCrear = tienePermiso(usuario, 'configuracion', 'CREAR')
  const puedeEditar = tienePermiso(usuario, 'configuracion', 'EDITAR')

  const [cargos, areas] = await Promise.all([
    prisma.cargo.findMany({
      include: { area: { select: { nombre: true } }, _count: { select: { colaboradores: true, contratos: true } } },
      orderBy: [{ area: { nombre: 'asc' } }, { nombre: 'asc' }],
    }),
    prisma.area.findMany({ orderBy: { nombre: 'asc' }, select: { id: true, nombre: true } }),
  ])

  return (
    <div className="mx-auto max-w-4xl">
      <Encabezado
        titulo="Cargos"
        descripcion="Crea y edita los cargos de la empresa. Al editar un cargo, el cambio se refleja en todos los colaboradores y contratos que lo tienen asignado."
      />
      <CargosCliente
        puedeCrear={puedeCrear}
        puedeEditar={puedeEditar}
        areas={areas}
        cargos={cargos.map((c) => ({
          id: c.id, nombre: c.nombre, areaId: c.areaId, area: c.area.nombre,
          nivel: c.nivel ?? '', funciones: c.funciones ?? '', claseRiesgoDefecto: c.claseRiesgoDefecto ?? '',
          activo: c.activo, asignados: c._count.colaboradores + c._count.contratos,
        }))}
      />
    </div>
  )
}
