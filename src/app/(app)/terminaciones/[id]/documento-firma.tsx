'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Send, FileText, Undo2, Upload, FilePlus2, Paperclip } from 'lucide-react'
import { reducirImagen } from '@/lib/reducir-imagen'
import { Button, buttonVariants } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { PasosFirma } from '@/components/firma/pasos-firma'
import { Pill } from '@/components/ui-kit'
import {
  solicitarCodigoFirmaEmpresa, enviarDocumentoTerminacion, retirarDocumentoTerminacion,
  generarDocumentoTerminacion, subirDocumentoFirmadoTerminacion, quitarDocumentoFirmadoTerminacion,
} from '../acciones'

export type TipoDoc = 'CARTA' | 'PAZ_Y_SALVO' | 'LIQUIDACION'

/** Estado de un documento que firma el trabajador. */
export type EstadoDocumento = { documentoId: string | null; enviadaEn: string | null; firmadaEn: string | null }

/**
 * ¿Se envía a firmar en la app (la empresa firma y el trabajador firma en su
 * autoservicio)? Por ahora no (decisión de empresa, 2026-10-30): la plataforma
 * genera el PDF para imprimir y Talento Humano sube el documento firmado.
 * Poner en `true` para volver a la firma en la app.
 */
export const ENVIO_A_FIRMA_EN_APP = false

type Archivo = { nombre: string; dataUri: string }

/**
 * Fila de un documento de la terminación: su estado, verlo, generarlo sin
 * firmas para imprimir y subirlo ya firmado. Los envíos hechos antes para
 * firmar en la app se siguen viendo y se pueden retirar.
 */
export function DocumentoFirma({ terminacionId, tipo, titulo, estado, listo, faltante, puedeEditar, cerrada }: {
  terminacionId: string
  tipo: TipoDoc
  titulo: string
  estado: EstadoDocumento
  /** ¿Se puede generar o enviar ya? */
  listo: boolean
  /** Qué falta, cuando no está listo. */
  faltante?: string
  puedeEditar: boolean
  cerrada: boolean
}) {
  const router = useRouter()
  const [firmando, setFirmando] = useState(false)
  const [retirando, setRetirando] = useState(false)
  const [generando, setGenerando] = useState(false)
  const [quitando, setQuitando] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [archivo, setArchivo] = useState<Archivo | null>(null)
  const [g, setG] = useState(false)
  const editable = puedeEditar && !cerrada
  const pendiente = !estado.enviadaEn && !estado.firmadaEn
  const idArchivo = `firmado-${tipo}-${terminacionId}`

  async function retirar() {
    setRetirando(true)
    const res = await retirarDocumentoTerminacion({ id: terminacionId, tipo })
    setRetirando(false)
    if (res.ok) { toast.success('Envío retirado.'); router.refresh() } else toast.error(res.error)
  }

  async function generar() {
    setGenerando(true)
    const res = await generarDocumentoTerminacion({ id: terminacionId, tipo })
    setGenerando(false)
    if (res.ok) { toast.success('Documento generado. Ábrelo con «Ver» para imprimirlo.'); router.refresh() } else toast.error(res.error)
  }

  async function quitar() {
    setQuitando(true)
    const res = await quitarDocumentoFirmadoTerminacion({ id: terminacionId, tipo })
    setQuitando(false)
    if (res.ok) { toast.success('Documento quitado.'); router.refresh() } else toast.error(res.error)
  }

  async function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const elegido = e.target.files?.[0]
    e.target.value = ''
    if (!elegido) return
    // Viaja dentro de la acción (tope de 4 MB, y en base64 pesa un tercio más).
    const f = await reducirImagen(elegido)
    if (f.size > 3 * 1024 * 1024) { toast.error('El archivo pesa más de 3 MB. Toma una foto o expórtalo más liviano.'); return }
    const lector = new FileReader()
    lector.onload = () => setArchivo({ nombre: f.name, dataUri: String(lector.result) })
    lector.readAsDataURL(f)
  }

  function cerrarSubir() { setSubiendo(false); setArchivo(null) }

  async function subir() {
    if (!archivo) return
    setG(true)
    const res = await subirDocumentoFirmadoTerminacion({ id: terminacionId, tipo, archivo: archivo.dataUri })
    setG(false)
    if (!res.ok) { toast.error(res.error); return }
    toast.success('Documento firmado guardado.')
    cerrarSubir()
    router.refresh()
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
      <FileText className="size-4 shrink-0 text-muted-foreground" />
      <span className="text-sm font-medium">{titulo}</span>
      {estado.firmadaEn ? (
        <Pill tone="ok">Firmada · {estado.firmadaEn}</Pill>
      ) : estado.enviadaEn ? (
        <Pill tone="warn">Esperando firma del trabajador</Pill>
      ) : estado.documentoId ? (
        <Pill tone="muted">Generada · falta subirla firmada</Pill>
      ) : (
        <Pill tone="muted">{listo ? 'Por subir firmada' : faltante ?? 'Pendiente'}</Pill>
      )}
      <span className="flex-1" />
      <div className="flex flex-wrap items-center gap-1.5">
        {estado.documentoId && (
          <VisorPdf documentoId={estado.documentoId} titulo={titulo} className={buttonVariants({ size: 'sm', variant: 'outline' }) + ' gap-1.5'}>
            <FileText className="size-3.5" /> Ver
          </VisorPdf>
        )}
        {editable && estado.enviadaEn && !estado.firmadaEn && (
          <Button size="sm" variant="ghost" onClick={retirar} disabled={retirando} title="Retirar el envío para corregir">
            {retirando ? <Spinner /> : <Undo2 className="size-4" />} Retirar
          </Button>
        )}
        {editable && estado.firmadaEn && (
          <Button size="sm" variant="ghost" onClick={quitar} disabled={quitando} title="Quitar el documento firmado si se subió el equivocado">
            {quitando ? <Spinner /> : <Undo2 className="size-4" />} Quitar
          </Button>
        )}
        {editable && pendiente && (
          <Button size="sm" variant="outline" onClick={generar} disabled={generando || !listo} title={listo ? 'Genera el PDF sin firmas para imprimirlo' : faltante}>
            {generando ? <Spinner /> : <FilePlus2 className="size-4" />} {estado.documentoId ? 'Generar de nuevo' : 'Generar PDF'}
          </Button>
        )}
        {editable && pendiente && (
          <Button size="sm" onClick={() => setSubiendo(true)}>
            <Upload className="size-4" /> Subir firmado
          </Button>
        )}
        {ENVIO_A_FIRMA_EN_APP && editable && pendiente && (
          <Button size="sm" onClick={() => setFirmando(true)} disabled={!listo} title={listo ? undefined : faltante}>
            <Send className="size-4" /> Firmar y enviar
          </Button>
        )}
      </div>

      {firmando && (
        <FirmaEmpresa terminacionId={terminacionId} tipo={tipo} titulo={titulo} onCerrar={() => setFirmando(false)} />
      )}

      <Dialog open={subiendo} onOpenChange={(o) => { if (!g && !o) cerrarSubir() }}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader><DialogTitle>Subir firmado · {titulo}</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={idArchivo}>Documento firmado (PDF o foto) <span className="text-destructive">*</span></Label>
            <label htmlFor={idArchivo} className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground hover:bg-accent/50">
              <Paperclip className="size-4 shrink-0" />
              <span className="min-w-0 truncate">{archivo ? archivo.nombre : 'Elegir PDF o imagen'}</span>
            </label>
            <input id={idArchivo} type="file" accept="application/pdf,image/*" className="sr-only" onChange={elegir} />
            <p className="text-[11px] text-muted-foreground">El paso queda como firmado; no se le pide firma al trabajador en la app.</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={cerrarSubir} disabled={g}>Cancelar</Button>
            <Button onClick={subir} disabled={g || !archivo}>{g && <Spinner />}Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
