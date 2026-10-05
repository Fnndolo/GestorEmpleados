import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { TiposDocumentoCliente } from './tipos-cliente'

export const metadata = { title: 'Tipos de documento · Configuración' }

export default async function TiposDocumentoPage() {
  const usuario = await requerirPermiso('configuracion', 'VER')
  const puedeCrear = tienePermiso(usuario, 'configuracion', 'CREAR')
  const puedeEditar = tienePermiso(usuario, 'configuracion', 'EDITAR')
  const puedeEliminar = tienePermiso(usuario, 'configuracion', 'ELIMINAR')

  const tipos = await prisma.tipoDocumento.findMany({
    orderBy: { nombre: 'asc' },
    include: {
      requeridos: { select: { tipoVinculo: true } },
      _count: { select: { documentos: true } },
    },
  })

  return (
    <div>
      {/* El encabezado lo pone el cliente: ahí vive el + que abre el diálogo. */}
      <TiposDocumentoCliente
        puedeCrear={puedeCrear}
        puedeEditar={puedeEditar}
        puedeEliminar={puedeEliminar}
        tipos={tipos.map((t) => ({
          id: t.id,
          nombre: t.nombre,
          descripcion: t.descripcion ?? '',
          requiereVencimiento: t.requiereVencimiento,
          nivelAcceso: t.nivelAcceso,
          diasPrimeraAlerta: t.diasPrimeraAlerta,
          diasUltimaAlerta: t.diasUltimaAlerta,
          activo: t.activo,
          vinculosObligatorios: t.requeridos.map((r) => r.tipoVinculo),
          documentos: t._count.documentos,
        }))}
      />
    </div>
  )
}
