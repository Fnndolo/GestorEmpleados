'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PenLine, FileCheck2, FileText, Calculator, Banknote, Mail } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { PasosFirma } from '@/components/firma/pasos-firma'
import { Pill } from '@/components/ui-kit'
import { solicitarCodigoFirmaRetiro, firmarDocumentoRetiro } from '../retiro-acciones'

export type DocRetiro = {
  terminacionId: string
  tipo: 'CARTA' | 'PAZ_Y_SALVO' | 'LIQUIDACION'
  titulo: string
  detalle: string
  documentoId: string | null
  firmadaEn: string | null
  comprobanteDocId: string | null
  pagadaEn: string | null
}

const AVISO: Record<DocRetiro['tipo'], string> = {
  CARTA: 'Al firmar confirmas que recibiste esta comunicación (firma electrónica, Ley 527 de 1999). No implica que estés de acuerdo con su contenido.',
  PAZ_Y_SALVO: 'Al firmar confirmas la entrega de tu puesto de trabajo (firma electrónica, Ley 527 de 1999). No renuncias a tu liquidación ni a ningún derecho laboral.',
  LIQUIDACION: 'Al firmar das el recibido de tu liquidación definitiva (firma electrónica, Ley 527 de 1999). No renuncias a derechos ciertos e indiscutibles.',
}

/** Un documento del retiro: por firmar (abre los tres pasos de firma) o ya firmado. */
export function DocumentoRetiro({ doc }: { doc: DocRetiro }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [firma, setFirma] = useState<string | null>(null)
  const [g, setG] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [correoEnviado, setCorreoEnviado] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const codigoCompleto = /^\d{6}$/.test(codigo)
  const Icono = doc.tipo === 'CARTA' ? Mail : doc.tipo === 'PAZ_Y_SALVO' ? FileCheck2 : Calculator

  function reiniciar() {
    setAbierto(false)
    setFirma(null)
    setCodigo('')
    setCorreoEnviado(null)
  }

  async function enviarCodigo() {
    setEnviando(true)
    const res = await solicitarCodigoFirmaRetiro({ terminacionId: doc.terminacionId, tipo: doc.tipo })
    setEnviando(false)
    if (res.ok) {
      setCorreoEnviado(res.datos.email)
      toast.success(`Te enviamos un código a ${res.datos.email}. Vence en ${res.datos.vigenciaMin} minutos.`)
    } else toast.error(res.error)
  }

  async function firmar() {
    if (!firma || !codigoCompleto) return
    setG(true)
    const res = await firmarDocumentoRetiro({ terminacionId: doc.terminacionId, tipo: doc.tipo, firmaDataUri: firma, codigo })
    setG(false)
    if (res.ok) {
      toast.success('Documento firmado.')
      reiniciar()
      router.refresh()
    } else toast.error(res.error)
  }

  return (
    <li>
      <Card><CardContent className="p-3">
        <div className="flex items-center gap-2">
          <Icono className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{doc.titulo}</span>
          {doc.pagadaEn ? <Pill tone="ok">Pagada</Pill> : doc.firmadaEn ? <Pill tone="ok">Firmada</Pill> : <Pill tone="warn">Por firmar</Pill>}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {doc.detalle}{doc.firmadaEn ? ` · firmaste el ${doc.firmadaEn}` : ''}{doc.pagadaEn ? ` · pagada el ${doc.pagadaEn}` : ''}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {doc.documentoId && (
            <VisorPdf documentoId={doc.documentoId} titulo={doc.titulo} className={buttonVariants({ size: 'sm', variant: 'outline' }) + ' gap-1.5'}>
              <FileText className="size-3.5" /> Ver
            </VisorPdf>
          )}
          {doc.comprobanteDocId && (
            <VisorPdf documentoId={doc.comprobanteDocId} titulo="Comprobante de pago" className={buttonVariants({ size: 'sm', variant: 'outline' }) + ' gap-1.5'}>
              <Banknote className="size-3.5" /> Comprobante
            </VisorPdf>
          )}
          {!doc.firmadaEn && (
            <Button size="sm" onClick={() => setAbierto(true)}><PenLine className="size-4" /> Revisar y firmar</Button>
          )}
        </div>
      </CardContent></Card>

      <Dialog open={abierto} onOpenChange={(ab) => (ab ? setAbierto(true) : reiniciar())}>
        <DialogContent className="max-h-[88vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>Firmar · {doc.titulo}</DialogTitle></DialogHeader>
          <PasosFirma
            documentos={doc.documentoId ? [{ id: doc.documentoId, titulo: doc.titulo, etiqueta: doc.titulo, icono: Icono }] : []}
            correoEnviado={correoEnviado}
            enviando={enviando}
            onEnviarCodigo={enviarCodigo}
            codigo={codigo}
            onCodigo={setCodigo}
            onFirma={setFirma}
            idCodigo={`codigo-retiro-${doc.tipo}-${doc.terminacionId}`}
          />
          <p className="text-[11px] leading-snug text-muted-foreground">{AVISO[doc.tipo]}</p>
          <DialogFooter>
            <Button variant="ghost" onClick={reiniciar}>Cancelar</Button>
            <Button onClick={firmar} disabled={g || !firma || !codigoCompleto}>{g && <Spinner />}Firmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  )
}
