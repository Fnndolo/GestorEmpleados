'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PenLine, FileCheck2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FirmaCaptura } from '@/components/firma/firma-captura'
import { firmarContratoLaboral, marcarEmpresaFirmoContratoLaboral } from '@/app/(app)/contratos/acciones'
import { firmarContratoOps, marcarEmpresaFirmoContratoOps } from '@/app/(app)/contratos/ops-acciones'

/**
 * La firma de la empresa (empleador en el laboral, contratante en el OPS), desde
 * la fila del contrato. La del trabajador o contratista va por su autoservicio.
 */
export function FirmarEmpresa({ contratoId, vinculo, nombre, subidoParaFirma = false }: {
  contratoId: string
  /** PDF subido para firmar en la app: ofrece marcar que la empresa ya firmó en el papel. */
  subidoParaFirma?: boolean
  vinculo: 'LABORAL' | 'OPS'
  /** Quien firma por la empresa (representante legal), si se conoce. */
  nombre: string
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [firma, setFirma] = useState<string | null>(null)
  const [g, setG] = useState(false)
  const rol = vinculo === 'LABORAL' ? 'empleador' : 'contratante'
  const [marcando, setMarcando] = useState(false)
  const [m, setM] = useState(false)

  async function marcar() {
    setM(true)
    const res = vinculo === 'LABORAL'
      ? await marcarEmpresaFirmoContratoLaboral({ contratoId })
      : await marcarEmpresaFirmoContratoOps({ contratoId })
    setM(false)
    if (res.ok) {
      toast.success(res.datos.firmado ? 'Listo. El contrato quedó firmado con la firma del trabajador.' : 'Listo. Solo falta la firma del trabajador.')
      setMarcando(false)
      router.refresh()
    } else toast.error(res.error)
  }

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
      <div className="flex flex-wrap gap-1.5">
        {subidoParaFirma && (
          <Button size="sm" variant="outline" onClick={() => setMarcando(true)}><FileCheck2 className="size-4" /> Ya firmó en el documento</Button>
        )}
        <Button size="sm" onClick={() => setAbierto(true)}><PenLine className="size-4" /> Firmar</Button>
      </div>
      <Dialog open={marcando} onOpenChange={(o) => { if (!m) setMarcando(o) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>La empresa ya firmó en el documento</DialogTitle>
            <DialogDescription>Usa esto si el PDF que se subió ya traía la firma del {rol}. No se le pide firma en la app y, si el trabajador ya firmó, el contrato queda firmado.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMarcando(false)} disabled={m}>Cancelar</Button>
            <Button onClick={marcar} disabled={m}>{m && <Spinner />}Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
