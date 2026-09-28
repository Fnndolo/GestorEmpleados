'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PenLine, Building2, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FirmaCaptura } from '@/components/firma/firma-captura'
import { FilaDocumento } from '@/components/contratos/fila-documento'
import { firmarContratoOps } from '../../ops-acciones'

type Estado = { firmado: boolean; fecha: string | null }

/**
 * Las dos firmas del contrato OPS, como filas de la lista de documentos. La del
 * contratante se aplica aquí; la del contratista (con la autorización de datos),
 * solo él desde su autoservicio.
 */
export function FirmasContrato({ contratoId, puedeFirmar, contratante, contratista }: {
  contratoId: string
  puedeFirmar: boolean
  /** `enPdf`: el contratante ya firmó en el PDF aportado; no se le pide firma digital. */
  contratante: Estado & { nombre: string; enPdf?: boolean }
  contratista: Estado & { nombre: string }
}) {
  return (
    <>
      <ParteFirma contratoId={contratoId} icono={Building2} etiqueta="Contratante" nombre={contratante.nombre} estado={contratante} puedeFirmar={puedeFirmar && !contratante.enPdf} enPdf={contratante.enPdf} />
      <ParteFirma contratoId={contratoId} icono={UserRound} etiqueta="Contratista" nombre={contratista.nombre} estado={contratista} puedeFirmar={false} pendienteTexto="Firma desde su autoservicio" />
    </>
  )
}

function ParteFirma({ contratoId, icono, etiqueta, nombre, estado, puedeFirmar, pendienteTexto = 'Pendiente de firma', enPdf = false }: {
  contratoId: string
  icono: typeof Building2
  etiqueta: string
  nombre: string
  estado: Estado
  puedeFirmar: boolean
  pendienteTexto?: string
  /** Ya firmó en el PDF aportado: se muestra como firmado, sin botón. */
  enPdf?: boolean
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [firma, setFirma] = useState<string | null>(null)
  const [g, setG] = useState(false)
  const firmado = enPdf || estado.firmado

  async function firmar() {
    if (!firma) return
    setG(true)
    const res = await firmarContratoOps({ contratoId, rol: 'CONTRATANTE', firmaDataUri: firma })
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
      <FilaDocumento
        icono={icono}
        titulo={`${etiqueta} · ${nombre || '—'}`}
        tono={firmado ? 'ok' : 'pendiente'}
        sub={enPdf ? 'Firmó en el documento aportado' : estado.firmado ? `Firmado${estado.fecha ? ` · ${estado.fecha}` : ''}` : pendienteTexto}
      >
        {!firmado && puedeFirmar && (
          <Button size="sm" onClick={() => setAbierto(true)}><PenLine className="size-4" /> Firmar</Button>
        )}
      </FilaDocumento>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Firmar como {etiqueta.toLowerCase()}</DialogTitle>
            <DialogDescription>{nombre}. Al firmar, aceptas el contenido del contrato (firma electrónica, Ley 527 de 1999).</DialogDescription>
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
