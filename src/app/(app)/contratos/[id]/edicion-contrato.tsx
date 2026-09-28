'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { RefreshCw, FilePenLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { regenerarPdfContratoLaboral } from '../acciones'

/**
 * Editar el texto del contrato y regenerar su PDF desde la plantilla. Solo
 * mientras nadie ha firmado (desde la primera firma queda congelado y los
 * cambios van por otrosí) y si los contratos se redactan desde plantilla.
 */
export function EdicionContrato({ contratoId, tieneDocumento }: { contratoId: string; tieneDocumento: boolean }) {
  const router = useRouter()
  const [regen, setRegen] = useState(false)

  async function regenerar() {
    setRegen(true)
    const res = await regenerarPdfContratoLaboral({ contratoId })
    setRegen(false)
    if (res.ok) { toast.success('Documento del contrato generado.'); router.refresh() } else toast.error(res.error)
  }

  return (
    <>
      {tieneDocumento && (
        <Button size="icon" variant="outline" className="size-8" asChild>
          <Link href={`/contratos/${contratoId}/documento`} aria-label="Editar contrato" title="Editar contrato"><FilePenLine className="size-4" /></Link>
        </Button>
      )}
      <Button size="sm" variant={tieneDocumento ? 'outline' : 'default'} onClick={regenerar} disabled={regen} title={tieneDocumento ? 'Regenerar PDF' : 'Generar desde la plantilla'}>
        {regen ? <Spinner /> : <RefreshCw className="size-4" />}
        <span className={tieneDocumento ? 'sr-only' : undefined}>{tieneDocumento ? 'Regenerar PDF' : 'Generar'}</span>
      </Button>
    </>
  )
}
