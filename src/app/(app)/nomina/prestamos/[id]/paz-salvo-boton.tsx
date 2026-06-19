'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { FileCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { generarPazSalvoDePrestamo } from '../../acciones'

export function PazSalvoBoton({ prestamoId }: { prestamoId: string }) {
  const router = useRouter()
  const [g, setG] = useState(false)

  async function generar() {
    setG(true)
    const res = await generarPazSalvoDePrestamo({ prestamoId })
    setG(false)
    if (res.ok) {
      toast.success('Paz y salvo generado.')
      window.open(`/api/documentos/${(res.datos as { documentoId: string }).documentoId}`, '_blank')
      router.refresh()
    } else toast.error(res.error)
  }

  return (
    <Button size="sm" onClick={generar} disabled={g}>
      {g ? <Spinner /> : <FileCheck className="size-4" />} Generar paz y salvo
    </Button>
  )
}
