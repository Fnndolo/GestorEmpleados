'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { DoorOpen, Eye, FileText, Undo2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { PasosFirma } from '@/components/firma/pasos-firma'
import { Pill } from '@/components/ui-kit'
import { solicitarCodigoRenuncia, presentarMiRenuncia, retirarMiRenuncia, previsualizarMiRenuncia } from '../retiro-acciones'

/**
 * Presentar la renuncia desde la app: último día, motivo (opcional), la carta
 * para verla antes (el ojito la abre en el visor, como los demás documentos) y
 * la firma (código al correo + firma dibujada). Le llega a Talento Humano.
 */
export function PresentarRenuncia({ hoy }: { hoy: string }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [fecha, setFecha] = useState('')
  const [motivo, setMotivo] = useState('')
  const [firma, setFirma] = useState<string | null>(null)
  const [codigo, setCodigo] = useState('')
  const [correoEnviado, setCorreoEnviado] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [carta, setCarta] = useState<Blob | null>(null)
  const [armando, setArmando] = useState(false)
  const [g, setG] = useState(false)
  const listo = !!fecha && !!firma && /^\d{6}$/.test(codigo)

  function cerrar() {
    setAbierto(false); setFirma(null); setCodigo(''); setCorreoEnviado(null)
  }

  async function verCarta() {
    setArmando(true)
    const res = await previsualizarMiRenuncia({ fechaRetiro: fecha, motivo: motivo || undefined })
    setArmando(false)
    if (!res.ok) { toast.error(res.error); return }
    const bytes = Uint8Array.from(atob(res.datos.pdfBase64), (c) => c.charCodeAt(0))
    setCarta(new Blob([bytes], { type: 'application/pdf' }))
  }

  async function enviarCodigo() {
    setEnviando(true)
    const res = await solicitarCodigoRenuncia({})
    setEnviando(false)
    if (res.ok) { setCorreoEnviado(res.datos.email); toast.success(`Te enviamos un código a ${res.datos.email}.`) } else toast.error(res.error)
  }

  async function presentar() {
    if (!listo || !firma) return
    setG(true)
    const res = await presentarMiRenuncia({ fechaRetiro: fecha, motivo: motivo || undefined, firmaDataUri: firma, codigo })
    setG(false)
    if (res.ok) { toast.success('Renuncia presentada.'); cerrar(); router.refresh() } else toast.error(res.error)
  }

  return (
    <>
      <Card className="py-0"><CardContent className="flex items-center gap-3 p-3">
        <DoorOpen className="size-5 shrink-0 text-muted-foreground" />
        <p className="min-w-0 flex-1 text-sm font-medium">Renuncia</p>
        <Button size="sm" variant="outline" onClick={() => setAbierto(true)}>Presentar</Button>
      </CardContent></Card>

      <Dialog open={abierto} onOpenChange={(o) => (o ? setAbierto(true) : !g && cerrar())}>
        <DialogContent className="max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>Presentar renuncia</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ultimo-dia">Último día de trabajo</Label>
              <Input id="ultimo-dia" type="date" min={hoy} value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <Textarea id="motivo-renuncia" aria-label="Motivo" placeholder="Motivo" rows={2} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            <div className="flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">Carta de renuncia</span>
              <Button
                size="icon" variant="outline" className="size-8" onClick={verCarta} disabled={!fecha || armando}
                aria-label="Ver la carta" title={fecha ? 'Ver la carta' : 'Indica tu último día'}
              >
                {armando ? <Spinner /> : <Eye className="size-4" />}
              </Button>
            </div>
            <PasosFirma
              documentos={[]}
              correoEnviado={correoEnviado}
              enviando={enviando}
              onEnviarCodigo={enviarCodigo}
              codigo={codigo}
              onCodigo={setCodigo}
              onFirma={setFirma}
              idCodigo="codigo-renuncia"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={cerrar} disabled={g}>Cancelar</Button>
            <Button onClick={presentar} disabled={g || !listo}>{g && <Spinner />}Firmar y presentar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {carta && (
        <VisorPdf archivo={carta} titulo="Carta de renuncia" abierto onAbiertoChange={(v) => { if (!v) setCarta(null) }} />
      )}
    </>
  )
}

/** La renuncia ya presentada, esperando respuesta: ver la carta o retirarla. */
export function RenunciaPresentada({ id, fechaRetiro, presentadaEn, documentoId }: { id: string; fechaRetiro: string; presentadaEn: string; documentoId: string | null }) {
  const router = useRouter()
  const [g, setG] = useState(false)

  async function retirar() {
    if (!confirm('¿Retirar tu renuncia?')) return
    setG(true)
    const res = await retirarMiRenuncia({ renunciaId: id })
    setG(false)
    if (res.ok) { toast.success('Renuncia retirada.'); router.refresh() } else toast.error(res.error)
  }

  return (
    <Card className="py-0"><CardContent className="p-3">
      <div className="flex items-center gap-2">
        <DoorOpen className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">Tu renuncia</span>
        <Pill tone="warn">Esperando respuesta</Pill>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Presentada el {presentadaEn} · último día {fechaRetiro}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {documentoId && (
          <VisorPdf documentoId={documentoId} titulo="Carta de renuncia" className={buttonVariants({ size: 'sm', variant: 'outline' }) + ' gap-1.5'}>
            <FileText className="size-3.5" /> Ver carta
          </VisorPdf>
        )}
        <Button size="sm" variant="ghost" onClick={retirar} disabled={g}>{g ? <Spinner /> : <Undo2 className="size-4" />} Retirar</Button>
      </div>
    </CardContent></Card>
  )
}
