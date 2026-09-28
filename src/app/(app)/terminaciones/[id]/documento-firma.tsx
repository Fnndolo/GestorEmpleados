'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Send, FileText, Undo2 } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { PasosFirma } from '@/components/firma/pasos-firma'
import { Pill } from '@/components/ui-kit'
import { solicitarCodigoFirmaEmpresa, enviarDocumentoTerminacion, retirarDocumentoTerminacion } from '../acciones'

export type TipoDoc = 'CARTA' | 'PAZ_Y_SALVO' | 'LIQUIDACION'

/** Estado de un documento que firma el trabajador. */
export type EstadoDocumento = { documentoId: string | null; enviadaEn: string | null; firmadaEn: string | null }

/**
 * Fila de un documento de la terminación que se firma en la app: su estado,
 * verlo, enviarlo (Talento Humano firma por la empresa al enviarlo) y retirar
 * el envío mientras el trabajador no haya firmado.
 */
export function DocumentoFirma({ terminacionId, tipo, titulo, estado, listo, faltante, puedeEditar, cerrada }: {
  terminacionId: string
  tipo: TipoDoc
  titulo: string
  estado: EstadoDocumento
  /** ¿Se puede enviar ya? (el paz y salvo exige todas las áreas verificadas). */
  listo: boolean
  /** Qué falta para poder enviarlo, cuando no está listo. */
  faltante?: string
  puedeEditar: boolean
  cerrada: boolean
}) {
  const router = useRouter()
  const [firmando, setFirmando] = useState(false)
  const [retirando, setRetirando] = useState(false)

  async function retirar() {
    setRetirando(true)
    const res = await retirarDocumentoTerminacion({ id: terminacionId, tipo })
    setRetirando(false)
    if (res.ok) { toast.success('Envío retirado.'); router.refresh() } else toast.error(res.error)
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
      <FileText className="size-4 shrink-0 text-muted-foreground" />
      <span className="text-sm font-medium">{titulo}</span>
      {estado.firmadaEn ? (
        <Pill tone="ok">Firmada · {estado.firmadaEn}</Pill>
      ) : estado.enviadaEn ? (
        <Pill tone="warn">Esperando firma del trabajador</Pill>
      ) : (
        <Pill tone="muted">{listo ? 'Por enviar' : faltante ?? 'Pendiente'}</Pill>
      )}
      <span className="flex-1" />
      <div className="flex items-center gap-1.5">
        {estado.documentoId && (
          <VisorPdf documentoId={estado.documentoId} titulo={titulo} className={buttonVariants({ size: 'sm', variant: 'outline' }) + ' gap-1.5'}>
            <FileText className="size-3.5" /> Ver
          </VisorPdf>
        )}
        {puedeEditar && !cerrada && estado.enviadaEn && !estado.firmadaEn && (
          <Button size="sm" variant="ghost" onClick={retirar} disabled={retirando} title="Retirar el envío para corregir">
            {retirando ? <Spinner /> : <Undo2 className="size-4" />} Retirar
          </Button>
        )}
        {puedeEditar && !cerrada && !estado.enviadaEn && (
          <Button size="sm" onClick={() => setFirmando(true)} disabled={!listo} title={listo ? undefined : faltante}>
            <Send className="size-4" /> Firmar y enviar
          </Button>
        )}
      </div>

      {firmando && (
        <FirmaEmpresa terminacionId={terminacionId} tipo={tipo} titulo={titulo} onCerrar={() => setFirmando(false)} />
      )}
    </div>
  )
}

/** Talento Humano firma por la empresa (código a su correo + firma dibujada) y envía. */
function FirmaEmpresa({ terminacionId, tipo, titulo, onCerrar }: { terminacionId: string; tipo: TipoDoc; titulo: string; onCerrar: () => void }) {
  const router = useRouter()
  const [firma, setFirma] = useState<string | null>(null)
  const [codigo, setCodigo] = useState('')
  const [correoEnviado, setCorreoEnviado] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [g, setG] = useState(false)
  const codigoCompleto = /^\d{6}$/.test(codigo)

  async function enviarCodigo() {
    setEnviando(true)
    const res = await solicitarCodigoFirmaEmpresa({ id: terminacionId, tipo })
    setEnviando(false)
    if (res.ok) {
      setCorreoEnviado(res.datos.email)
      toast.success(`Te enviamos un código a ${res.datos.email}. Vence en ${res.datos.vigenciaMin} minutos.`)
    } else toast.error(res.error)
  }

  async function enviar() {
    if (!firma || !codigoCompleto) return
    setG(true)
    const res = await enviarDocumentoTerminacion({ id: terminacionId, tipo, firmaDataUri: firma, codigo })
    setG(false)
    if (res.ok) {
      toast.success('Firmado y enviado al trabajador.')
      onCerrar()
      router.refresh()
    } else toast.error(res.error)
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !g) onCerrar() }}>
      <DialogContent className="max-h-[88vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>Firmar y enviar · {titulo}</DialogTitle></DialogHeader>
        <PasosFirma
          documentos={[]}
          correoEnviado={correoEnviado}
          enviando={enviando}
          onEnviarCodigo={enviarCodigo}
          codigo={codigo}
          onCodigo={setCodigo}
          onFirma={setFirma}
          idCodigo={`codigo-empresa-${tipo}-${terminacionId}`}
        />
        <p className="text-[11px] leading-snug text-muted-foreground">
          Firmas por la empresa (Ley 527 de 1999). Al enviarlo, le llega al trabajador para que lo firme desde su autoservicio.
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={onCerrar} disabled={g}>Cancelar</Button>
          <Button onClick={enviar} disabled={g || !firma || !codigoCompleto}>{g ? <Spinner /> : <Send className="size-4" />} Firmar y enviar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
