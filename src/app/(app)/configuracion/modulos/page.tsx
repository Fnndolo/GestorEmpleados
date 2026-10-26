import Link from 'next/link'
import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { Layers, ChevronRight } from 'lucide-react'
import { Constructor } from './constructor'
import { ModuloAcciones, type ModuloItem } from './modulo-acciones'

export const metadata = { title: 'Módulos personalizados · Configuración' }

export default async function ModulosPage() {
  const usuario = await requerirPermiso('configuracion', 'EDITAR')
  const puedeEliminar = tienePermiso(usuario, 'configuracion', 'ELIMINAR')
  const modulos = await prisma.moduloPersonalizado.findMany({
    include: {
      campos: { orderBy: { orden: 'asc' } },
      // Solo los datos: para saber qué campos ya tienen valores (y no se pueden borrar).
      registros: { select: { datos: true } },
    },
    orderBy: { creadoEn: 'desc' },
  })

  const items: ModuloItem[] = modulos.map((m) => ({
    id: m.id, slug: m.slug, nombre: m.nombre, descripcion: m.descripcion, icono: m.icono, seccion: m.seccion,
    vinculo: m.vinculo, registros: m.registros.length,
    campos: m.campos.map((c) => ({
      id: c.id, clave: c.clave, etiqueta: c.etiqueta, tipo: c.tipo, requerido: c.requerido, opciones: c.opciones,
      generaAlerta: c.generaAlerta, mostrarEnTabla: c.mostrarEnTabla,
      conValor: m.registros.filter((r) => {
        const v = (r.datos as Record<string, unknown>)[c.clave]
        return v !== undefined && v !== null && v !== ''
      }).length,
    })),
  }))

  return (
    <div>
      <Encabezado
        titulo="Módulos personalizados"
        descripcion="Crea pestañas y módulos a la medida con campos propios, sin necesidad de programar."
        acciones={<Constructor />}
      />
      {items.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-1.5 py-12 text-center text-muted-foreground">
          <Layers className="size-8" />
          <p className="font-medium text-foreground">Ninguno creado</p>
          <p className="max-w-prose text-sm">Sirven para registrar cosas propias del negocio —pólizas, convenios, activos especiales— sin esperar a que se programen.</p>
        </CardContent></Card>
      ) : (
        <Card><CardContent className="p-0 divide-y">
          {items.map((m) => (
            <div key={m.id} className="flex items-center gap-2 p-3 sm:gap-3">
              <Link href={`/modulos/${m.slug}`} className="flex min-w-0 flex-1 items-center gap-3 hover:underline">
                <Layers className="size-5 text-muted-foreground shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-sm">{m.nombre}</span>
                  <span className="block truncate text-xs text-muted-foreground">{m.campos.length} campos · {m.registros} registros · {m.seccion}</span>
                </span>
              </Link>
              <ModuloAcciones modulo={m} puedeEliminar={puedeEliminar} />
              <Link href={`/modulos/${m.slug}`} aria-label={`Abrir ${m.nombre}`} className="max-sm:hidden"><ChevronRight className="size-4 text-muted-foreground" /></Link>
            </div>
          ))}
        </CardContent></Card>
      )}
    </div>
  )
}
