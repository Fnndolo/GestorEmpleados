import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { MembretePanel } from './membrete-panel'

export const metadata = { title: 'Papel membretado · Configuración' }

export default async function MembretePage() {
  const usuario = await requerirPermiso('configuracion', 'VER')
  const puedeEditar = tienePermiso(usuario, 'configuracion', 'EDITAR')
  const empresa = await prisma.configuracionEmpresa.findFirst({
    select: { membreteFondoPath: true, emailContacto: true, nit: true, sitioWeb: true },
  })

  return (
    <div className="max-w-4xl">
      <Encabezado
        titulo="Papel membretado"
        descripcion="Fondo de los documentos legales: contratos, autorizaciones de tratamiento de datos y acuerdos de evaluación previa."
      />
      <MembretePanel
        tieneMembrete={Boolean(empresa?.membreteFondoPath)}
        puedeEditar={puedeEditar}
        pie={[empresa?.emailContacto, empresa?.nit ? `NIT ${empresa.nit}` : null, empresa?.sitioWeb]
          .filter(Boolean)
          .join('     ·     ')}
      />
    </div>
  )
}
