'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PenLine, RefreshCw, FilePenLine, FileText, ShieldCheck, Building2, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FirmaCaptura } from '@/components/firma/firma-captura'
import { firmarContratoLaboral, regenerarPdfContratoLaboral } from '../acciones'
import { GENERAR_CONTRATOS_DESDE_PLANTILLA } from '@/lib/contratos-config'
import { FilaDocumento, VerDocumento } from '@/components/contratos/fila-documento'

type Estado = { firmado: boolean; fecha: string | null }

/**
 * El contrato, su autorización de datos y las dos firmas, como filas de la
 * lista de documentos. La firma del empleador se aplica aquí; la del empleado,
 * solo él desde su autoservicio.
 */
export function FirmasLaboral({
  contratoId, numero, tieneDocumento, documentoId, autorizacionId, puedeFirmar, empleador, empleado, subido = false,
}: {
  contratoId: string
  numero: string
  tieneDocumento: boolean
  documentoId: string | null
  autorizacionId: string | null
  puedeFirmar: boolean
  /** `enPdf`: el empleador ya firmó en el PDF aportado; no se le pide firma digital. */
  empleador: Estado & { nombre: string; enPdf?: boolean }
  empleado: Estado & { nombre: string }
  /** PDF subido para firma: no hay plantilla que editar ni regenerar. */
  subido?: boolean
}) {
  const router = useRouter()
  const [regen, setRegen] = useState(false)
  const alguienFirmo = empleador.firmado || empleado.firmado
  const ambos = (empleador.firmado || !!empleador.enPdf) && empleado.firmado
  // Mientras nadie firme, el documento se puede editar y el PDF regenerarse
  // (solo si los contratos se redactan desde plantilla). Desde la primera firma
  // queda congelado: los cambios van por otrosí.
  const editable = GENERAR_CONTRATOS_DESDE_PLANTILLA && !subido && puedeFirmar && !alguienFirmo

  async function regenerar() {
    setRegen(true)
    const res = await regenerarPdfContratoLaboral({ contratoId })
    setRegen(false)
    if (res.ok) { toast.success('Documento del contrato generado.'); router.refresh() } else toast.error(res.error)
  }

  return (
    <>
      <FilaDocumento
        icono={FileText}
        titulo="Contrato"
        tono={!tieneDocumento ? undefined : ambos ? 'ok' : 'pendiente'}
        sub={!tieneDocumento ? 'Sin documento' : ambos ? 'Firmado por ambas partes' : alguienFirmo ? 'Falta una firma · contenido congelado' : 'Pendiente de firmas'}
      >
        {documentoId && <VerDocumento documentoId={documentoId} titulo={`Contrato ${numero}`} />}
        {editable && tieneDocumento && (
          <Button size="icon" variant="outline" className="size-8" asChild>
            <Link href={`/contratos/${contratoId}/documento`} aria-label="Editar contrato" title="Editar contrato"><FilePenLine className="size-4" /></Link>
          </Button>
        )}
        {editable && (
          <Button size="sm" variant={tieneDocumento ? 'outline' : 'default'} onClick={regenerar} disabled={regen} title={tieneDocumento ? 'Regenerar PDF' : 'Generar desde la plantilla'}>
            {regen ? <Spinner /> : <RefreshCw className="size-4" />}
            <span className={tieneDocumento ? 'sr-only' : undefined}>{tieneDocumento ? 'Regenerar PDF' : 'Generar'}</span>
          </Button>
        )}
      </FilaDocumento>
      {tieneDocumento && (
        <>
          <ParteFirma contratoId={contratoId} icono={Building2} etiqueta="Empleador" nombre={empleador.nombre} estado={empleador} puedeFirmar={puedeFirmar && !empleador.enPdf} enPdf={empleador.enPdf} />
          <ParteFirma contratoId={contratoId} icono={UserRound} etiqueta="Empleado" nombre={empleado.nombre} estado={empleado} puedeFirmar={false} pendienteTexto="Firma desde su autoservicio" />
        </>
      )}
      {autorizacionId && (
        <FilaDocumento icono={ShieldCheck} titulo="Autorización de datos">
          <VerDocumento documentoId={autorizacionId} titulo={`Autorización de datos ${numero}`} />
        </FilaDocumento>
      )}
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
    const res = await firmarContratoLaboral({ contratoId, firmaDataUri: firma })
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
