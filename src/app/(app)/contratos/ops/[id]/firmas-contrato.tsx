'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PenLine, CircleCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FirmaCaptura } from '@/components/firma/firma-captura'
import { firmarContratoOps } from '../../ops-acciones'

type Estado = { firmado: boolean; fecha: string | null }

export function FirmasContrato({
  contratoId,
  puedeFirmar,
  contratante,
  contratista,
}: {
  contratoId: string
  puedeFirmar: boolean
  contratante: Estado & { nombre: string }
  contratista: Estado & { nombre: string }
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <ParteFirma contratoId={contratoId} etiqueta="El contratante" nombre={contratante.nombre} estado={contratante} puedeFirmar={puedeFirmar} />
      {/* La firma del contratista solo la aplica él mismo, desde su autoservicio. */}
      <ParteFirma contratoId={contratoId} etiqueta="La contratista" nombre={contratista.nombre} estado={contratista} puedeFirmar={false} pendienteTexto="Pendiente · firma desde su autoservicio" />
    </div>
  )
}

function ParteFirma({
  contratoId,
  etiqueta,
  nombre,
  estado,
  puedeFirmar,
  pendienteTexto = 'Pendiente de firma',
}: {
  contratoId: string
  etiqueta: string
  nombre: string
  estado: Estado
  puedeFirmar: boolean
  pendienteTexto?: string
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [firma, setFirma] = useState<string | null>(null)
  const [g, setG] = useState(false)

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
    } else {
      toast.error(res.error)
    }
  }

  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{etiqueta}</div>
      <div className="mt-0.5 text-sm font-medium">{nombre || '—'}</div>
      {estado.firmado ? (
        <div className="mt-2 flex items-center gap-1.5 text-sm text-emerald-600">
          <CircleCheck className="size-4" /> Firmado{estado.fecha ? ` · ${estado.fecha}` : ''}
        </div>
      ) : puedeFirmar ? (
        <Button size="sm" variant="outline" className="mt-2" onClick={() => setAbierto(true)}>
          <PenLine className="size-4" /> Firmar
        </Button>
      ) : (
        <div className="mt-2 text-sm text-muted-foreground">{pendienteTexto}</div>
      )}

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
    </div>
  )
}
