'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Paperclip, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { borrarDocumento } from '@/app/(app)/colaboradores/documentos-acciones'
import { FilaDocumento, VerDocumento } from '@/components/contratos/fila-documento'

/** Un documento adjunto al contrato (lo que se sube desde "Acciones → Adjuntar documento"). */
export function FilaAnexo({ id, contratoId, nombre, fecha, puedeEditar }: { id: string; /** Contrato laboral u OPS al que va adjunto. */ contratoId: string; nombre: string; fecha: string; puedeEditar: boolean }) {
  const router = useRouter()
  const [borrar, setBorrar] = useState(false)

  async function eliminar() {
    const res = await borrarDocumento({ id, entidadId: contratoId })
    if (res.ok) { toast.success('Documento eliminado.'); router.refresh() } else toast.error(res.error)
    setBorrar(false)
  }

  return (
    <>
      <FilaDocumento icono={Paperclip} titulo={nombre} sub={`Adjunto · ${fecha}`}>
        <VerDocumento documentoId={id} titulo={nombre} />
        {puedeEditar && (
          <Button size="icon" variant="ghost" className="size-8 text-muted-foreground hover:text-destructive" onClick={() => setBorrar(true)} aria-label={`Eliminar ${nombre}`}>
            <Trash2 className="size-4" />
          </Button>
        )}
      </FilaDocumento>
      <AlertDialog open={borrar} onOpenChange={setBorrar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar «{nombre}»</AlertDialogTitle>
            <AlertDialogDescription>El archivo se borrará permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={eliminar}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
