import { requerirPermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { EmpresaForm } from './form'

export const metadata = { title: 'Empresa · Configuración' }

export default async function EmpresaPage() {
  await requerirPermiso('configuracion', 'VER')
  const empresa = await prisma.configuracionEmpresa.findFirst()

  return (
    <div className="mx-auto max-w-2xl">
      <Encabezado
        titulo="Datos de la empresa"
        descripcion="Aparecen en los documentos generados (desprendibles, certificaciones, actas)."
      />
      <EmpresaForm
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
        }}
      />
    </div>
  )
}
