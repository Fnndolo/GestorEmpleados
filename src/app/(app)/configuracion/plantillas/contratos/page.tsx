import Link from 'next/link'
import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, FileText, ChevronRight } from 'lucide-react'
import { AccionesPlantilla } from './acciones-cliente'
import { ETIQUETA_TIPO_PLANTILLA } from '@/lib/validaciones/plantilla-contrato'

export const metadata = { title: 'Plantillas de contrato · Configuración' }

export default async function PlantillasPage() {
  const usuario = await requerirPermiso('configuracion', 'VER')
  const puedeCrear = tienePermiso(usuario, 'configuracion', 'CREAR')
  const puedeEliminar = tienePermiso(usuario, 'configuracion', 'ELIMINAR')

  const plantillas = await prisma.plantillaContrato.findMany({
    orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
    include: { _count: { select: { clausulas: true } } },
  })

  return (
    <div className="max-w-4xl">
      <Encabezado
        titulo="Plantillas de contrato"
        descripcion="El texto de los contratos vive aquí, no en el código: puedes corregir una cláusula sin depender de un despliegue. Los datos de cada contrato se insertan con variables."
        acciones={
          puedeCrear ? (
            <Button size="sm" asChild>
              <Link href="/configuracion/plantillas/contratos/nueva"><Plus className="size-4" /> Nueva plantilla</Link>
            </Button>
          ) : null
        }
      />

      {plantillas.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <FileText className="size-8" />
            <p className="max-w-md text-sm">
              No hay plantillas. Sin al menos una activa por tipo no se pueden crear contratos nuevos
              desde el sistema (sí se pueden seguir subiendo contratos ya firmados).
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card><CardContent className="divide-y p-0">
          {plantillas.map((p) => (
            <div key={p.id} className="flex items-center gap-3 p-3">
              <Link href={`/configuracion/plantillas/contratos/${p.id}`} className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{p.nombre}</p>
                  <Badge variant="outline">{ETIQUETA_TIPO_PLANTILLA[p.tipo as keyof typeof ETIQUETA_TIPO_PLANTILLA] ?? p.tipo}</Badge>
                  {!p.activa && <Badge variant="secondary">Inactiva</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {p.titulo} · {p._count.clausulas} cláusula(s)
                </p>
              </Link>
              <AccionesPlantilla id={p.id} nombre={p.nombre} puedeCrear={puedeCrear} puedeEliminar={puedeEliminar} />
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </div>
          ))}
        </CardContent></Card>
      )}
    </div>
  )
}
