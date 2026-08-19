'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { BotonEliminar } from '@/components/ui-kit/boton-eliminar'
import { duplicarPlantilla, eliminarPlantilla } from './acciones'

/** Duplicar y eliminar desde la lista, sin entrar al editor. */
export function AccionesPlantilla({
  id, nombre, puedeCrear, puedeEliminar,
}: {
  id: string; nombre: string; puedeCrear: boolean; puedeEliminar: boolean
}) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState(false)

  async function duplicar() {
    setOcupado(true)
    const res = await duplicarPlantilla({ id })
    setOcupado(false)
    if (res.ok) {
      toast.success('Copia creada, inactiva. Edítala y actívala cuando esté lista.')
      router.push(`/configuracion/plantillas/contratos/${res.datos.id}`)
    } else toast.error(res.error)
  }

  async function eliminar() {
    if (!confirm(`¿Eliminar la plantilla "${nombre}" y sus cláusulas? No se puede deshacer.`)) return
    setOcupado(true)
    const res = await eliminarPlantilla({ id })
    setOcupado(false)
    if (res.ok) { toast.success('Plantilla eliminada.'); router.refresh() }
    else toast.error(res.error)
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      {puedeCrear && (
        <Button size="icon" variant="ghost" onClick={duplicar} disabled={ocupado} aria-label="Duplicar plantilla" title="Duplicar">
          {ocupado ? <Spinner /> : <Copy className="size-4" />}
        </Button>
      )}
      {puedeEliminar && <BotonEliminar onEliminar={eliminar} etiqueta="Eliminar plantilla" />}
    </div>
  )
}
