'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PenLine, CircleCheck, FileText, HandCoins } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { PasosFirma } from '@/components/firma/pasos-firma'
import { Pill } from '@/components/ui-kit'
import { solicitarCodigoFirmaDescuento, firmarMiAcuerdoDescuento } from '../descuentos-acciones'

export type DescuentoItem = {
  id: string
  asunto: string
  valorTotal: string
  cuotas: string
  saldo: string
  desde: string
  pagado: boolean
  /** El acuerdo que se lee (el firmado si ya existe; si no, el original). */
  acuerdoDocId: string | null
  porFirmar: boolean
  fechaFirma: string | null
}

/**
 * Descuentos de nómina del colaborador. Los que traen un acuerdo de pago para
 * firmar se firman aquí, con los mismos pasos que un contrato: leer, código al
 * correo y firma dibujada.
 */
export function MisDescuentos({ items }: { items: DescuentoItem[] }) {
  return (
    <ul className="space-y-2">
      {items.map((d) => <Fila key={d.id} d={d} />)}
    </ul>
  )
}

function Fila({ d }: { d: DescuentoItem }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [firma, setFirma] = useState<string | null>(null)
  const [codigo, setCodigo] = useState('')
  const [correoEnviado, setCorreoEnviado] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [g, setG] = useState(false)
  const codigoCompleto = /^\d{6}$/.test(codigo)
  const titulo = `Acuerdo de pago · ${d.asunto}`

  function reiniciar() {
    setAbierto(false); setFirma(null); setCodigo(''); setCorreoEnviado(null)
  }

  async function enviarCodigo() {
    setEnviando(true)
    const res = await solicitarCodigoFirmaDescuento({ prestamoId: d.id })
    setEnviando(false)
    if (res.ok) {
      setCorreoEnviado(res.datos.email)
      toast.success(`Te enviamos un código a ${res.datos.email}. Vence en ${res.datos.vigenciaMin} minutos.`)
    } else toast.error(res.error)
  }

  async function firmar() {
    if (!firma || !codigoCompleto) return
    setG(true)
    const res = await firmarMiAcuerdoDescuento({ prestamoId: d.id, firmaDataUri: firma, codigo })
    setG(false)
    if (res.ok) {
      toast.success('Acuerdo firmado. Ya puedes ver el documento firmado.')
      reiniciar()
      router.refresh()
    } else toast.error(res.error)
  }

  return (
    <li>
      <Card><CardContent className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <HandCoins className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{d.asunto}</span>
          <Pill tone={d.porFirmar ? 'warn' : d.pagado ? 'ok' : 'info'}>{d.porFirmar ? 'Por firmar' : d.pagado ? 'Pagado' : 'En curso'}</Pill>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {d.valorTotal} en {d.cuotas} · desde {d.desde}
          {!d.pagado && !d.porFirmar ? ` · saldo ${d.saldo}` : ''}
          {d.fechaFirma ? ` · firmaste el ${d.fechaFirma}` : ''}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {d.acuerdoDocId && (
            <VisorPdf documentoId={d.acuerdoDocId} titulo={titulo} mimeType="application/pdf" className={buttonVariants({ size: 'sm', variant: 'outline' }) + ' gap-1.5'}>
              <FileText className="size-3.5" /> Ver acuerdo
            </VisorPdf>
          )}
          {d.porFirmar && (
            <Button size="sm" onClick={() => setAbierto(true)}><PenLine className="size-4" /> Revisar y firmar</Button>
          )}
          {d.fechaFirma && (
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <CircleCheck className="size-4" /> Firmado
            </span>
          )}
        </div>
      </CardContent></Card>

      <Dialog open={abierto} onOpenChange={(ab) => (ab ? setAbierto(true) : reiniciar())}>
        <DialogContent className="max-h-[88vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>Firmar acuerdo de pago</DialogTitle></DialogHeader>
          <PasosFirma
            documentos={d.acuerdoDocId ? [{ id: d.acuerdoDocId, titulo, etiqueta: 'Acuerdo de pago', icono: FileText }] : []}
            correoEnviado={correoEnviado}
            enviando={enviando}
            onEnviarCodigo={enviarCodigo}
            codigo={codigo}
            onCodigo={setCodigo}
            onFirma={setFirma}
            idCodigo={`codigo-descuento-${d.id}`}
          />
          <p className="text-[11px] leading-snug text-muted-foreground">
            Al firmar autorizas que se descuenten de tu nómina {d.valorTotal} en {d.cuotas}, desde {d.desde} (CST art. 149; firma electrónica, Ley 527 de 1999).
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={reiniciar}>Cancelar</Button>
            <Button onClick={firmar} disabled={g || !firma || !codigoCompleto}>{g && <Spinner />}Firmar acuerdo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  )
}
