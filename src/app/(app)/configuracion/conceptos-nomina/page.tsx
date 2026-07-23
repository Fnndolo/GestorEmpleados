import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { ConceptosCliente } from './conceptos-cliente'

export const metadata = { title: 'Conceptos de nómina · Configuración' }

export default async function ConceptosNominaPage() {
  const usuario = await requerirPermiso('configuracion', 'VER')
  const puedeEditar = tienePermiso(usuario, 'configuracion', 'EDITAR')

  const conceptos = await prisma.conceptoNomina.findMany({
    orderBy: [{ esSistema: 'desc' }, { tipo: 'asc' }, { orden: 'asc' }, { nombre: 'asc' }],
  })

  return (
    <div className="mx-auto max-w-3xl">
      <Encabezado
        titulo="Conceptos de nómina"
        descripcion="Catálogo de devengados y deducciones. Cada concepto se marca como constitutivo o no de salario (arts. 127 y 128 CST): eso decide si entra al IBC de seguridad social y a las bases de prestaciones."
      />
      <ConceptosCliente
        puedeEditar={puedeEditar}
        conceptos={conceptos.map((c) => ({
          id: c.id,
          codigo: c.codigo,
          nombre: c.nombre,
          tipo: c.tipo,
          esSistema: c.esSistema,
          activo: c.activo,
          constitutivoSalario: c.constitutivoSalario,
          afectaIbcSs: c.afectaIbcSs,
          basePrestaciones: c.basePrestaciones,
          baseVacaciones: c.baseVacaciones,
          valorFijo: c.valorFijo ? Number(c.valorFijo) : null,
          cuentaContable: c.cuentaContable,
        }))}
      />
    </div>
  )
}
