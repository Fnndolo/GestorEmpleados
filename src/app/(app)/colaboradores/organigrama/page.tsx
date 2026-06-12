import { requerirPermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { whereColaboradores } from '@/server/consultas/colaboradores'
import { Encabezado } from '@/components/shell/encabezado'
import { Organigrama, type NodoOrg } from './organigrama'

export const metadata = { title: 'Organigrama · Smart Gadgets RH' }

export default async function OrganigramaPage() {
  const usuario = await requerirPermiso('colaboradores', 'VER')
  const where = await whereColaboradores(usuario, { estado: 'ACTIVO' })

  const colaboradores = await prisma.colaborador.findMany({
    where,
    select: {
      id: true, nombres: true, apellidos: true, jefeInmediatoId: true, fotoPath: true,
      cargo: { select: { nombre: true } },
      area: { select: { nombre: true } },
    },
    orderBy: [{ apellidos: 'asc' }],
  })

  const idsVisibles = new Set(colaboradores.map((c) => c.id))
  const nodos: NodoOrg[] = colaboradores.map((c) => ({
    id: c.id,
    nombre: `${c.nombres} ${c.apellidos}`,
    cargo: c.cargo?.nombre ?? c.area?.nombre ?? 'Sin cargo',
    tieneFoto: Boolean(c.fotoPath),
    // Si el jefe no está en la vista (alcance), se trata como raíz
    jefeId: c.jefeInmediatoId && idsVisibles.has(c.jefeInmediatoId) ? c.jefeInmediatoId : null,
  }))

  return (
    <div className="mx-auto max-w-6xl">
      <Encabezado titulo="Organigrama" descripcion="Estructura organizacional por jefe inmediato." />
      {nodos.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center border rounded-lg border-dashed">
          No hay colaboradores activos para mostrar.
        </p>
      ) : (
        <Organigrama nodos={nodos} />
      )}
    </div>
  )
}
