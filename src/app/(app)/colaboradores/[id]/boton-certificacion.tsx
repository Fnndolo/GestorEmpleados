'use client'

import { useState } from 'react'
import { AdjuntarDocumento } from '@/components/documentos/adjuntar-documento'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { FileBadge, Eye, Ban } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { generarCertificacionRRHH, anularCertificacion } from '../certificacion-acciones'
import { DialogAnular } from '@/components/contratos/dialog-anular'

export type CertificacionEmitida = { id: string; tipo: string; dirigidaA: string | null; fecha: string; documentoId: string | null }

const TIPO_CERT: Record<string, string> = {
  SIMPLE: 'Simple', CON_SALARIO: 'Con salario', CON_FUNCIONES: 'Con funciones', ENTIDAD_FINANCIERA: 'Entidad financiera',
}

export function BotonCertificacion({ colaboradorId, certificaciones = [], puedeEliminar = false }: {
  colaboradorId: string
  /** Las ya emitidas, de la más reciente a la más antigua: se ven y se anulan desde aquí. */
  certificaciones?: CertificacionEmitida[]
  puedeEliminar?: boolean
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [anulando, setAnulando] = useState<CertificacionEmitida | null>(null)
  const [tipo, setTipo] = useState<'SIMPLE' | 'CON_SALARIO' | 'CON_FUNCIONES' | 'ENTIDAD_FINANCIERA'>('SIMPLE')
  const [dirigidaA, setDirigidaA] = useState('')
  const [g, setG] = useState(false)
  const [docId, setDocId] = useState<string | null>(null)
  // Id de la certificación (no del documento): es lo que necesita el adjunto
  // para reemplazar el PDF por uno propio.
  const [certId, setCertId] = useState<string | null>(null)

  async function generar() {
    setG(true)
    const res = await generarCertificacionRRHH({ colaboradorId, tipo, dirigidaA: dirigidaA || undefined })
    setG(false)
    if (res.ok) {
      toast.success('Certificación generada.')
      const datos = res.datos as { documentoId: string; certificacionId: string }
      setDocId(datos.documentoId)
      setCertId(datos.certificacionId)
      router.refresh()
    } else toast.error(res.error)
  }

  return (
    <>
      <Button size="sm" onClick={() => { setAbierto(true); setDocId(null); setCertId(null) }}>
        <FileBadge className="size-4" /> <span className="hidden sm:inline">Certificación</span>
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generar certificación laboral</DialogTitle>
            <DialogDescription>El PDF se guarda en los documentos del colaborador.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as 'SIMPLE')}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SIMPLE">Simple (cargo y fechas)</SelectItem>
                  <SelectItem value="CON_SALARIO">Con salario</SelectItem>
                  <SelectItem value="CON_FUNCIONES">Con funciones</SelectItem>
                  <SelectItem value="ENTIDAD_FINANCIERA">Para entidad financiera</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Dirigida a (opcional)</Label><Input value={dirigidaA} onChange={(e) => setDirigidaA(e.target.value)} /></div>
            {docId && (
              <div className="space-y-2">
                <VisorPdf documentoId={docId} titulo="Certificación laboral" mimeType="application/pdf" className={buttonVariants() + ' w-full'}>
                  <Eye className="size-4" /> Ver certificación
                </VisorPdf>
                {/* Si la plantilla no dice lo que este caso necesita, se sustituye
                    por el PDF propio sin esperar a que se programe la variante. */}
                {certId && (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed p-2.5">
                    <p className="text-xs text-muted-foreground">¿La certificación necesita otro texto?</p>
                    <AdjuntarDocumento destino="certificacion" id={certId} tieneDocumento etiqueta="Subir la mía" variante="ghost" />
                  </div>
                )}
              </div>
            )}
          </div>
          {certificaciones.length > 0 && (
            <div className="space-y-1.5 pt-2">
              <p className="text-xs font-medium text-muted-foreground">Emitidas</p>
              <ul className="max-h-48 divide-y overflow-y-auto rounded-lg border">
                {certificaciones.map((cert) => (
                  <li key={cert.id} className="flex items-center gap-2 px-2.5 py-1.5 text-xs">
                    <span className="min-w-0 flex-1 truncate">
                      {TIPO_CERT[cert.tipo] ?? cert.tipo}{cert.dirigidaA ? ` · ${cert.dirigidaA}` : ''} · {cert.fecha}
                    </span>
                    {cert.documentoId && (
                      <VisorPdf documentoId={cert.documentoId} titulo="Certificación laboral" mimeType="application/pdf" className={buttonVariants({ variant: 'ghost', size: 'icon', className: 'size-7' })}>
                        <Eye className="size-4" /><span className="sr-only">Ver</span>
                      </VisorPdf>
                    )}
                    {puedeEliminar && (
                      <Button variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive" aria-label="Anular certificación" title="Anular certificación" onClick={() => setAnulando(cert)}>
                        <Ban className="size-4" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAbierto(false)}>Cerrar</Button>
            <Button onClick={generar} disabled={g}>{g ? <Spinner /> : <FileBadge className="size-4" />} Generar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {anulando && (
        <DialogAnular
          titulo="Anular certificación"
          detalle={`${TIPO_CERT[anulando.tipo] ?? anulando.tipo}${anulando.dirigidaA ? ` · dirigida a ${anulando.dirigidaA}` : ''} · ${anulando.fecha} · se borra el registro y su PDF.`}
          mensajeOk="Certificación anulada."
          accion={(motivo) => anularCertificacion({ id: anulando.id, motivo })}
          onClose={() => setAnulando(null)}
        />
      )}
    </>
  )
}
