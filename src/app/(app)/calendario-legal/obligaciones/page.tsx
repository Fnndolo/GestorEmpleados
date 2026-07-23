import Link from 'next/link'
import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { ObligacionesCliente } from './obligaciones-cliente'

export const metadata = { title: 'Obligaciones legales · Smart Gadgets RH' }

export default async function ObligacionesPage() {
  const usuario = await requerirPermiso('calendario_legal', 'VER')
  const puedeGestionar = tienePermiso(usuario, 'calendario_legal', 'CREAR')

  const [obligaciones, roles] = await Promise.all([
    prisma.obligacionLegal.findMany({
      orderBy: [{ activa: 'desc' }, { categoria: 'asc' }, { nombre: 'asc' }],
      include: { _count: { select: { ocurrencias: true } } },
    }),
    prisma.rol.findMany({ select: { nombre: true }, orderBy: { nombre: 'asc' } }),
  ])

  return (
    <div className="mx-auto max-w-4xl">
      <Encabezado
        titulo="Catálogo de obligaciones"
        descripcion="Las reglas de recurrencia que alimentan el calendario legal. Al editar una regla se recalculan sus próximas fechas."
        acciones={
          <Button variant="outline" size="sm" asChild>
            <Link href="/calendario-legal"><ArrowLeft className="size-4" /> Volver al calendario</Link>
          </Button>
        }
      />
      <ObligacionesCliente
        puedeGestionar={puedeGestionar}
        roles={roles.map((r) => r.nombre)}
        obligaciones={obligaciones.map((o) => ({
          id: o.id,
          nombre: o.nombre,
          categoria: o.categoria,
          periodicidad: o.periodicidad,
          diaBase: o.diaBase,
          mesBase: o.mesBase,
          mesesBase: o.mesesBase,
          cadaNAnios: o.cadaNAnios,
          porSede: o.porSede,
          responsableRol: o.responsableRol,
          fuenteLegal: o.fuenteLegal,
          descripcion: o.descripcion,
          activa: o.activa,
          ocurrencias: o._count.ocurrencias,
        }))}
      />
    </div>
  )
}
