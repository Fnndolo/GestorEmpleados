'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Spinner } from '@/components/ui/spinner'
import { BotonEliminar } from '@/components/ui-kit/boton-eliminar'
import { duplicarPlantilla, eliminarPlantilla, alternarPlantillaContrato } from './acciones'

/** Activar/desactivar, duplicar y eliminar desde la lista, sin entrar al editor. */
export function AccionesPlantilla({
  id, nombre, tipo, activa, unicaActiva, puedeCrear, puedeEditar = false, puedeEliminar,
}: {
  id: string; nombre: string; tipo: string; activa: boolean
  /** Es la única activa de su tipo: no se desactiva ni se borra. */
  unicaActiva: boolean
  puedeCrear: boolean; puedeEditar?: boolean; puedeEliminar: boolean
}) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState(false)
  const bloqueoUnica = `Es la única plantilla activa de tipo ${tipo}: sin ella no se pueden crear contratos. Crea o activa otra primero.`

  async function alternar(v: boolean) {
    setOcupado(true)
    const res = await alternarPlantillaContrato({ id, activa: v })
    setOcupado(false)
    if (res.ok) { toast.success(v ? 'Plantilla activada.' : 'Plantilla desactivada: ya no sale al crear contratos.'); router.refresh() }
    else toast.error(res.error, { duration: 8000 })
  }

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
      {puedeEditar && (
        <Switch
          checked={activa} onCheckedChange={alternar} disabled={ocupado || unicaActiva}
          aria-label={activa ? `Desactivar ${nombre}` : `Activar ${nombre}`}
          title={unicaActiva ? bloqueoUnica : activa ? 'Activa' : 'Inactiva'}
        />
      )}
      {puedeCrear && (
        <Button size="icon" variant="ghost" onClick={duplicar} disabled={ocupado} aria-label="Duplicar plantilla" title="Duplicar">
          {ocupado ? <Spinner /> : <Copy className="size-4" />}
        </Button>
      )}
      {puedeEliminar && <BotonEliminar onEliminar={eliminar} etiqueta="Eliminar plantilla" motivoBloqueo={unicaActiva ? bloqueoUnica : null} />}
    </div>
  )
}
