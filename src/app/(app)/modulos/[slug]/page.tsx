import { notFound } from 'next/navigation'
import { requerirSesion, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { ModuloDinamico } from './modulo-dinamico'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const m = await prisma.moduloPersonalizado.findUnique({ where: { slug } })
  return { title: `${m?.nombre ?? 'Módulo'} · Smart Gadgets RH` }
}

export default async function ModuloPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const usuario = await requerirSesion()

  const modulo = await prisma.moduloPersonalizado.findUnique({
    where: { slug },
    include: { campos: { orderBy: { orden: 'asc' } }, registros: { orderBy: { creadoEn: 'desc' }, take: 200 } },
  })
  if (!modulo || !modulo.activo) notFound()

  // Permiso: módulos personalizados visibles para quien pueda ver configuración o el custom permiso
  const puedeEditar = tienePermiso(usuario, 'configuracion', 'EDITAR') || tienePermiso(usuario, `custom:${slug}`, 'CREAR')

  return (
    <div className="mx-auto max-w-4xl">
      <Encabezado titulo={modulo.nombre} descripcion={modulo.descripcion ?? 'Módulo personalizado.'} />
      <ModuloDinamico
        moduloId={modulo.id}
        campos={modulo.campos.map((c) => ({ clave: c.clave, etiqueta: c.etiqueta, tipo: c.tipo, requerido: c.requerido, opciones: c.opciones, mostrarEnTabla: c.mostrarEnTabla }))}
        registros={modulo.registros.map((r) => ({ id: r.id, datos: r.datos as Record<string, unknown> }))}
        puedeEditar={puedeEditar}
      />
    </div>
  )
}
