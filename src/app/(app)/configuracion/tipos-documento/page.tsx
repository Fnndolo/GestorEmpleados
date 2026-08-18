import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
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
    <div className="max-w-5xl">
      <Encabezado
        titulo="Tipos de documento"
        descripcion="Catálogo de documentos del expediente y cuáles son obligatorios según el tipo de vínculo. Los que llevan vencimiento alimentan las alertas y el tablero de vencimientos."
      />
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
