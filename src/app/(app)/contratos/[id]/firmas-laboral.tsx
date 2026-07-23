'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PenLine, CircleCheck, RefreshCw, FilePenLine, Lock } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FirmaCaptura } from '@/components/firma/firma-captura'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { firmarContratoLaboral, regenerarPdfContratoLaboral } from '../acciones'

type Estado = { firmado: boolean; fecha: string | null }

export function FirmasLaboral({
  contratoId,
  numero,
  tieneDocumento,
  documentoId,
  autorizacionId,
  puedeFirmar,
  empleador,
  empleado,
}: {
  contratoId: string
  numero: string
  tieneDocumento: boolean
  documentoId: string | null
  autorizacionId: string | null
  puedeFirmar: boolean
  empleador: Estado & { nombre: string }
  empleado: Estado & { nombre: string }
}) {
  const router = useRouter()
  const [regen, setRegen] = useState(false)

  async function regenerar() {
    setRegen(true)
    const res = await regenerarPdfContratoLaboral({ contratoId })
    setRegen(false)
    if (res.ok) { toast.success('Documento del contrato generado.'); router.refresh() } else toast.error(res.error)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {documentoId && (
          <VisorPdf documentoId={documentoId} titulo={`Contrato ${numero}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            Ver contrato (PDF)
          </VisorPdf>
        )}
        {autorizacionId && (
          <VisorPdf documentoId={autorizacionId} titulo={`Autorización de datos ${numero}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            Autorización de datos
          </VisorPdf>
        )}
        {/* Mientras nadie firme, el documento se puede editar y el PDF regenerarse.
            Desde la primera firma el contenido queda congelado (cambios → otrosí). */}
        {puedeFirmar && !empleador.firmado && !empleado.firmado && (
          <>
            {tieneDocumento && (
              <Button size="sm" variant="outline" asChild>
                <Link href={`/contratos/${contratoId}/documento`}><FilePenLine className="size-4" /> Editar contrato</Link>
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={regenerar} disabled={regen}>
              {regen ? <Spinner /> : <RefreshCw className="size-4" />} {tieneDocumento ? 'Regenerar PDF' : 'Generar documento desde la plantilla'}
            </Button>
          </>
        )}
        {tieneDocumento && (empleador.firmado || empleado.firmado) && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="size-3.5" /> Contenido congelado por firma — cambios posteriores van por otrosí
          </span>
        )}
      </div>
      {tieneDocumento && (
        <div className="grid gap-3 sm:grid-cols-2">
          <ParteFirma contratoId={contratoId} etiqueta="El empleador" nombre={empleador.nombre} estado={empleador} puedeFirmar={puedeFirmar} />
          {/* La firma del empleado solo la aplica él mismo, desde su autoservicio. */}
          <ParteFirma contratoId={contratoId} etiqueta="El empleado" nombre={empleado.nombre} estado={empleado} puedeFirmar={false} pendienteTexto="Pendiente · firma desde su autoservicio" />
        </div>
      )}
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
    const res = await firmarContratoLaboral({ contratoId, firmaDataUri: firma })
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
