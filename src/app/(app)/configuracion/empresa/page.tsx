import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { EmpresaForm } from './form'
import { FirmaRepLegalForm } from './firma-form'
import { IdentidadEmpresa } from './identidad'
import { PLAZO_COMPROBANTE_POR_DEFECTO } from '@/lib/comprobante-permiso'

export const metadata = { title: 'Empresa · Configuración' }

export default async function EmpresaPage() {
  const usuario = await requerirPermiso('configuracion', 'VER')
  const puedeEditar = tienePermiso(usuario, 'configuracion', 'EDITAR')
  const [empresa, sedes, colaboradores] = await Promise.all([
    prisma.configuracionEmpresa.findFirst(),
    prisma.sede.count({ where: { activa: true } }),
    prisma.colaborador.count({ where: { estado: 'ACTIVO' } }),
  ])

  return (
    <div>
      <IdentidadEmpresa
        nombreComercial={empresa?.nombreComercial ?? ''}
        razonSocial={empresa?.razonSocial ?? ''}
        nit={empresa?.nit ?? ''}
        representanteLegal={empresa?.representanteLegal ?? ''}
        sedes={sedes}
        colaboradores={colaboradores}
      />
      <EmpresaForm
        puedeEditar={puedeEditar}
        valores={{
          razonSocial: empresa?.razonSocial ?? '',
          nombreComercial: empresa?.nombreComercial ?? '',
          nit: empresa?.nit ?? '',
          representanteLegal: empresa?.representanteLegal ?? '',
          representanteLegalCc: empresa?.representanteLegalCc ?? '',
          emailContacto: empresa?.emailContacto ?? '',
          telefono: empresa?.telefono ?? '',
          direccion: empresa?.direccion ?? '',
          sitioWeb: empresa?.sitioWeb ?? '',
          sabadoHabil: empresa?.sabadoHabil ?? true,
          plazoComprobantePermisoDias: empresa?.plazoComprobantePermisoDias ?? PLAZO_COMPROBANTE_POR_DEFECTO,
        }}
      />
      <FirmaRepLegalForm
        tieneFirma={Boolean(empresa?.firmaRepLegalPath)}
        puedeEditar={puedeEditar}
        repLegal={empresa?.representanteLegal ?? ''}
      />
    </div>
  )
}
