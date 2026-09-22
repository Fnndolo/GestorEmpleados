'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { eliminarContratoOps } from '../../ops-acciones'

/**
 * «Eliminar contrato» de un OPS: para el error de registro —el PDF a la persona
 * equivocada, un duplicado, datos mal puestos antes de mandarlo a firmar—, no
 * para terminar un contrato real; eso es «Cerrar contrato».
 *
 * Por eso vive abajo, separado del resto, con confirmación y diciendo qué se
 * lleva. El servidor no deja borrar uno ya firmado por el contratista ni con
 * cuentas de cobro radicadas.
 */
export function EliminarContratoOps({ contratoId, numero, firmado }: {
  contratoId: string
  numero: string
  /** Ya lo firmó el contratista: solo se explica por qué no se puede borrar. */
  firmado: boolean
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [borrando, empezar] = useTransition()

  function eliminar() {
    empezar(async () => {
      const res = await eliminarContratoOps({ id: contratoId })
      if (!res.ok) { toast.error(res.error, { duration: 8000 }); return }
      toast.success(`Contrato ${res.datos.numero} eliminado.`)
      setAbierto(false)
      router.push(res.datos.colaboradorId ? `/colaboradores/${res.datos.colaboradorId}` : '/contratos?tab=OPS')
    })
  }

  if (firmado) {
    return (
      <p className="text-xs text-muted-foreground">
        Este contrato ya lo firmó el contratista: no se puede eliminar. Si terminó, ciérralo; si la persona se retira, regístralo en Terminaciones.
      </p>
    )
  }

  return (
    <>
      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setAbierto(true)} disabled={borrando}>
        {borrando ? <Spinner /> : <Trash2 className="size-4" />} Eliminar contrato
      </Button>
      <p className="mt-1 text-xs text-muted-foreground">
        Solo si se registró por error y todavía nadie lo ha firmado. Un contrato real se cierra, no se borra.
      </p>

      <AlertDialog open={abierto} onOpenChange={setAbierto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar el contrato {numero}</AlertDialogTitle>
            <AlertDialogDescription>
              Se borran el registro, su PDF y su autorización de datos, sus entregables y su alerta de vencimiento.
              La ficha del contratista vuelve al vínculo de los contratos que le queden. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={eliminar} className="bg-destructive text-white hover:bg-destructive/90">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
