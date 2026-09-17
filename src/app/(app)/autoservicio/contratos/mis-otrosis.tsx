'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PenLine, CircleCheck, FileText, FilePen } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PasosFirma } from '@/components/firma/pasos-firma'
import { firmarMiOtrosi, solicitarCodigoFirmaOtrosi } from '../contratos-acciones'

export type OtrosiItem = {
  id: string
  numero: number
  fecha: string
  /** Qué cambió, ya redactado en el servidor ("Duración: 01/10/2026 al 31/12/2026"). */
  resumen: string
  documentoId: string | null
  firmado: boolean
  fechaFirma: string | null
}

/**
 * Otrosíes de un contrato laboral que se firman en la app.
 *
 * Cada uno trae su PDF —lo sube Talento Humano ya firmado por la empresa— y el
 * mismo paso de firma que el contrato: código al correo y firma dibujada, que se
 * estampa sobre el documento. Los otrosíes viejos, registrados sin firma, no
 * llegan aquí.
 */
export function MisOtrosis({ otrosis, contratoNumero }: { otrosis: OtrosiItem[]; contratoNumero: string }) {
  return (
    <div className="mt-3 border-t pt-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Otrosíes</p>
      <ul className="space-y-2">
        {otrosis.map((o) => <OtrosiFila key={o.id} o={o} contratoNumero={contratoNumero} />)}
      </ul>
    </div>
  )
}

function OtrosiFila({ o, contratoNumero }: { o: OtrosiItem; contratoNumero: string }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [firma, setFirma] = useState<string | null>(null)
  const [g, setG] = useState(false)
  // Autorización previa por código enviado al correo (Ley 527).
  const [codigo, setCodigo] = useState('')
  const [correoEnviado, setCorreoEnviado] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const codigoCompleto = /^\d{6}$/.test(codigo)
  const titulo = `Otrosí ${o.numero} del contrato ${contratoNumero}`

  function reiniciar() {
    setAbierto(false)
    setFirma(null)
    setCodigo('')
    setCorreoEnviado(null)
  }

  async function enviarCodigo() {
    setEnviando(true)
    const res = await solicitarCodigoFirmaOtrosi({ otrosiId: o.id })
    setEnviando(false)
    if (res.ok) {
      setCorreoEnviado(res.datos.email)
      toast.success(`Te enviamos un código a ${res.datos.email}. Vence en ${res.datos.vigenciaMin} minutos.`)
    } else {
      toast.error(res.error)
    }
  }

  async function firmar() {
    if (!firma || !codigoCompleto) return
    setG(true)
    const res = await firmarMiOtrosi({ otrosiId: o.id, firmaDataUri: firma, codigo })
    setG(false)
    if (res.ok) {
      toast.success('Otrosí firmado. Ya puedes descargar el documento firmado.')
      reiniciar()
      router.refresh()
    } else {
      toast.error(res.error)
    }
  }

  return (
    <li className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <FilePen className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium">Otrosí {o.numero}</span>
        <span className="text-xs text-muted-foreground">{o.fecha}</span>
        <span className="flex-1" />
        {o.documentoId && (
          <VisorPdf documentoId={o.documentoId} titulo={titulo} className={buttonVariants({ size: 'sm' }) + ' gap-2'}>
            <FileText className="size-4 shrink-0 text-primary" /> Ver PDF
          </VisorPdf>
        )}
      </div>
      {o.resumen && <p className="mt-1 text-sm text-muted-foreground">{o.resumen}</p>}

      <div className="mt-2">
        {o.firmado ? (
          <div className="flex items-center gap-1.5 text-sm text-emerald-600">
            <CircleCheck className="size-4" /> Firmaste este otrosí{o.fechaFirma ? ` el ${o.fechaFirma}` : ''}
          </div>
        ) : o.documentoId ? (
          <Button size="sm" onClick={() => setAbierto(true)}><PenLine className="size-4" /> Revisar y firmar</Button>
        ) : (
          <p className="text-sm text-muted-foreground">El PDF del otrosí aún no está disponible. Contacta a Talento Humano.</p>
        )}
      </div>

      <Dialog open={abierto} onOpenChange={(ab) => (ab ? setAbierto(true) : reiniciar())}>
        <DialogContent className="max-h-[88vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Firmar otrosí {o.numero}</DialogTitle>
          </DialogHeader>
          <PasosFirma
            documentos={o.documentoId ? [{ id: o.documentoId, titulo, etiqueta: `Otrosí ${o.numero}`, icono: FileText }] : []}
            correoEnviado={correoEnviado}
            enviando={enviando}
            onEnviarCodigo={enviarCodigo}
            codigo={codigo}
            onCodigo={setCodigo}
            onFirma={setFirma}
            idCodigo={`codigo-otrosi-${o.id}`}
          />
          <p className="text-[11px] leading-snug text-muted-foreground">
            Al firmar aceptas la modificación de tu contrato {contratoNumero} (firma electrónica, Ley 527 de 1999).
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={reiniciar}>Cancelar</Button>
            <Button onClick={firmar} disabled={g || !firma || !codigoCompleto}>{g && <Spinner />}Firmar otrosí</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  )
}
