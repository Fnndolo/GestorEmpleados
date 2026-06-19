import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { ParametrosForm } from './form'

export const metadata = { title: 'Parámetros de nómina · Configuración' }

async function actual(clave: string) {
  const p = await prisma.parametroLegal.findFirst({ where: { clave }, orderBy: { vigenciaDesde: 'desc' } })
  return p ? { valor: Number(p.valor), fuente: p.fuenteLegal, desde: p.vigenciaDesde } : null
}

export default async function ParametrosNominaPage() {
  const usuario = await requerirPermiso('configuracion', 'VER')
  const puedeEditar = tienePermiso(usuario, 'configuracion', 'EDITAR')
  const [smmlv, aux] = await Promise.all([actual('SMMLV'), actual('AUX_TRANSPORTE')])

  return (
    <div className="mx-auto max-w-2xl">
      <Encabezado
        titulo="Parámetros de nómina"
        descripcion="Salario mínimo (SMMLV) y auxilio de transporte vigentes. Se usan al liquidar la nómina y en los contratos que ganan salario mínimo."
      />
      <ParametrosForm
        puedeEditar={puedeEditar}
        smmlv={smmlv?.valor ?? 0}
        auxTransporte={aux?.valor ?? 0}
        fuenteSmmlv={smmlv?.fuente ?? ''}
        fuenteAux={aux?.fuente ?? ''}
      />
    </div>
  )
}
