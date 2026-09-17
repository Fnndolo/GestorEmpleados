'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PenLine, CircleCheck, FileText, CircleDollarSign } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { PasosFirma } from '@/components/firma/pasos-firma'
import { Pill, type PillTone } from '@/components/ui-kit'
import { solicitarCodigoFirmaPagoHorasExtra, firmarMiOrdenHorasExtra } from '../horas-extra-acciones'

export type PagoHorasExtraItem = {
  id: string
  desde: string
  hasta: string
  valor: string
  horasExtra: number
  estado: 'PENDIENTE' | 'ENVIADA_A_FIRMA' | 'FIRMADA' | 'PAGADO'
  ordenDocId: string | null
  comprobanteDocId: string | null
  fechaFirma: string | null
  fechaPago: string | null
}

const ESTADO: Record<PagoHorasExtraItem['estado'], { texto: string; tone: PillTone }> = {
  PENDIENTE: { texto: 'Por generar', tone: 'muted' },
  ENVIADA_A_FIRMA: { texto: 'Por firmar', tone: 'warn' },
  FIRMADA: { texto: 'Firmada · por pagar', tone: 'info' },
  PAGADO: { texto: 'Pagada', tone: 'ok' },
}

/**
 * Órdenes de pago de horas extra, más reciente primero. Cada una trae su PDF
 * —lo arma la app— y, mientras está "por firmar", el mismo paso de firma que
 * los contratos: código al correo y firma dibujada, que se estampa sobre el
 * documento.
 */
export function MisHorasExtra({ items }: { items: PagoHorasExtraItem[] }) {
  return (
    <ul className="space-y-2">
      {items.map((p) => <Fila key={p.id} p={p} />)}
    </ul>
  )
}

function Fila({ p }: { p: PagoHorasExtraItem }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [firma, setFirma] = useState<string | null>(null)
  const [g, setG] = useState(false)
  // Autorización previa por código enviado al correo (Ley 527).
  const [codigo, setCodigo] = useState('')
  const [correoEnviado, setCorreoEnviado] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const codigoCompleto = /^\d{6}$/.test(codigo)
  const titulo = `Orden de pago de horas extra · ${p.desde} a ${p.hasta}`

  function reiniciar() {
    setAbierto(false)
    setFirma(null)
    setCodigo('')
    setCorreoEnviado(null)
  }

  async function enviarCodigo() {
    setEnviando(true)
    const res = await solicitarCodigoFirmaPagoHorasExtra({ pagoId: p.id })
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
    const res = await firmarMiOrdenHorasExtra({ pagoId: p.id, firmaDataUri: firma, codigo })
    setG(false)
    if (res.ok) {
      toast.success('Orden firmada. Ya puedes descargar el documento firmado.')
      reiniciar()
      router.refresh()
    } else {
      toast.error(res.error)
    }
  }

  return (
    <li>
      <Card><CardContent className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <CircleDollarSign className="size-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium">{p.desde} a {p.hasta}</span>
          <span className="text-sm font-semibold tabular-nums">{p.valor}</span>
          <span className="flex-1" />
          <Pill tone={ESTADO[p.estado].tone}>{ESTADO[p.estado].texto}</Pill>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {p.horasExtra.toLocaleString('es-CO', { maximumFractionDigits: 2 })} horas extra
          {p.fechaFirma ? ` · firmaste el ${p.fechaFirma}` : ''}
          {p.fechaPago ? ` · pagada el ${p.fechaPago}` : ''}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {p.ordenDocId && (
            <VisorPdf documentoId={p.ordenDocId} titulo={titulo} className={buttonVariants({ size: 'sm', variant: 'outline' }) + ' gap-1.5'}>
              <FileText className="size-3.5" /> Ver orden
            </VisorPdf>
          )}
          {p.comprobanteDocId && (
            <VisorPdf documentoId={p.comprobanteDocId} titulo={`Comprobante de pago · ${p.desde} a ${p.hasta}`} className={buttonVariants({ size: 'sm', variant: 'outline' }) + ' gap-1.5'}>
              <FileText className="size-3.5" /> Ver comprobante
            </VisorPdf>
          )}
          {p.estado === 'ENVIADA_A_FIRMA' && (
            <Button size="sm" onClick={() => setAbierto(true)}><PenLine className="size-4" /> Revisar y firmar</Button>
          )}
          {(p.estado === 'FIRMADA' || p.estado === 'PAGADO') && (
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600">
              <CircleCheck className="size-4" /> Firmada
            </span>
          )}
        </div>
      </CardContent></Card>

      <Dialog open={abierto} onOpenChange={(ab) => (ab ? setAbierto(true) : reiniciar())}>
        <DialogContent className="max-h-[88vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Firmar orden de pago</DialogTitle>
          </DialogHeader>
          <PasosFirma
            documentos={p.ordenDocId ? [{ id: p.ordenDocId, titulo, etiqueta: 'Orden de pago', icono: FileText }] : []}
            correoEnviado={correoEnviado}
            enviando={enviando}
            onEnviarCodigo={enviarCodigo}
            codigo={codigo}
            onCodigo={setCodigo}
            onFirma={setFirma}
            idCodigo={`codigo-horas-extra-${p.id}`}
          />
          <p className="text-[11px] leading-snug text-muted-foreground">
            Al firmar aceptas el monto de {p.valor} por tus horas extra del {p.desde} al {p.hasta} (firma electrónica, Ley 527 de 1999).
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={reiniciar}>Cancelar</Button>
            <Button onClick={firmar} disabled={g || !firma || !codigoCompleto}>{g && <Spinner />}Firmar orden</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  )
}
