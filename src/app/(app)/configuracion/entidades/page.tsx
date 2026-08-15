import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { EntidadesCliente } from './entidades-cliente'

export const metadata = { title: 'Entidades y bancos · Configuración' }

export default async function EntidadesPage() {
  const usuario = await requerirPermiso('configuracion', 'VER')
  const puedeCrear = tienePermiso(usuario, 'configuracion', 'CREAR')
  const puedeEditar = tienePermiso(usuario, 'configuracion', 'EDITAR')

  const [entidades, bancos] = await Promise.all([
    prisma.entidadSeguridadSocial.findMany({
      orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
      include: {
        _count: {
          select: {
            colaboradoresEps: true,
            colaboradoresArl: true,
            colaboradoresAfp: true,
            colaboradoresFondoCesantias: true,
            colaboradoresCaja: true,
          },
        },
      },
    }),
    prisma.banco.findMany({
      orderBy: { nombre: 'asc' },
      include: { _count: { select: { colaboradores: true } } },
    }),
  ])

  return (
    <div className="max-w-5xl">
      <Encabezado
        titulo="Entidades y bancos"
        descripcion="Catálogo de EPS, ARL, fondos de pensiones y cesantías, cajas de compensación y bancos que aparecen al crear o editar un colaborador. Desactivar una entidad la retira de los formularios sin afectar a quienes ya la tienen asignada."
      />
      <EntidadesCliente
        puedeCrear={puedeCrear}
        puedeEditar={puedeEditar}
        entidades={entidades.map((e) => ({
          id: e.id,
          tipo: e.tipo,
          nombre: e.nombre,
          codigo: e.codigo ?? '',
          activa: e.activa,
          // Una entidad solo se usa en el campo que corresponde a su tipo, pero
          // sumamos todos los vínculos para no depender de esa correspondencia.
          asignados:
            e._count.colaboradoresEps +
            e._count.colaboradoresArl +
            e._count.colaboradoresAfp +
            e._count.colaboradoresFondoCesantias +
            e._count.colaboradoresCaja,
        }))}
        bancos={bancos.map((b) => ({
          id: b.id,
          nombre: b.nombre,
          codigoAch: b.codigoAch ?? '',
          activo: b.activo,
          asignados: b._count.colaboradores,
        }))}
      />
    </div>
  )
}
