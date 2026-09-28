'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PenLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FirmaCaptura } from '@/components/firma/firma-captura'
import { firmarContratoLaboral } from '@/app/(app)/contratos/acciones'
import { firmarContratoOps } from '@/app/(app)/contratos/ops-acciones'

/**
 * La firma de la empresa (empleador en el laboral, contratante en el OPS), desde
 * la fila del contrato. La del trabajador o contratista va por su autoservicio.
 */
export function FirmarEmpresa({ contratoId, vinculo, nombre }: {
  contratoId: string
  vinculo: 'LABORAL' | 'OPS'
  /** Quien firma por la empresa (representante legal), si se conoce. */
  nombre: string
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [firma, setFirma] = useState<string | null>(null)
  const [g, setG] = useState(false)
  const rol = vinculo === 'LABORAL' ? 'empleador' : 'contratante'

  async function firmar() {
    if (!firma) return
    setG(true)
    const res = vinculo === 'LABORAL'
      ? await firmarContratoLaboral({ contratoId, firmaDataUri: firma })
      : await firmarContratoOps({ contratoId, rol: 'CONTRATANTE', firmaDataUri: firma })
    setG(false)
    if (res.ok) {
      toast.success(res.datos.firmado ? 'Contrato firmado por ambas partes. Documento firmado generado.' : 'Firma registrada.')
      setAbierto(false)
      setFirma(null)
      router.refresh()
    } else toast.error(res.error)
  }

  return (
    <>
      <Button size="sm" onClick={() => setAbierto(true)}><PenLine className="size-4" /> Firmar</Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Firmar como {rol}</DialogTitle>
            <DialogDescription>{nombre ? `${nombre}. ` : ''}Al firmar, aceptas el contenido del contrato (firma electrónica, Ley 527 de 1999).</DialogDescription>
          </DialogHeader>
          <FirmaCaptura onChange={setFirma} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button onClick={firmar} disabled={g || !firma}>{g && <Spinner />}Aplicar firma</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
