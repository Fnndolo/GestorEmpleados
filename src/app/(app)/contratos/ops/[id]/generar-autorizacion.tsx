'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { FilePlusCorner, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { generarAutorizacionDatos, regenerarDocumentosContrato } from '../../ops-acciones'

/** Genera la autorización de datos para contratos creados antes de que existiera. */
export function GenerarAutorizacion({ contratoId }: { contratoId: string }) {
  const router = useRouter()
  const [g, setG] = useState(false)

  async function generar() {
    setG(true)
    const res = await generarAutorizacionDatos({ contratoId })
    setG(false)
    if (res.ok) {
      toast.success('Autorización de datos generada. El contratista ya la ve en su autoservicio.')
      router.refresh()
    } else toast.error(res.error)
  }

  return (
    <Button size="sm" variant="outline" onClick={generar} disabled={g}>
      {g ? <Spinner /> : <FilePlusCorner className="size-4" />} Generar autorización de datos
    </Button>
  )
}

/** Regenera los PDF del contrato desde su snapshot (cuando la generación falló al crear). */
export function RegenerarDocumentos({ contratoId }: { contratoId: string }) {
  const router = useRouter()
  const [g, setG] = useState(false)

  async function regenerar() {
    setG(true)
    const res = await regenerarDocumentosContrato({ contratoId })
    setG(false)
    if (res.ok) {
      toast.success('Documentos regenerados. Ya están disponibles para el contratista.')
      router.refresh()
    } else toast.error(res.error)
  }

  return (
    <Button size="sm" variant="outline" onClick={regenerar} disabled={g}>
      {g ? <Spinner /> : <RefreshCw className="size-4" />} Regenerar documentos
    </Button>
  )
}
