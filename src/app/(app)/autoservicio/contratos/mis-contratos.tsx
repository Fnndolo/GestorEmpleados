'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PenLine, CircleCheck, FileText, ShieldCheck, FilePenLine, Mail, MailCheck } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FirmaCaptura } from '@/components/firma/firma-captura'
import {
  firmarMiContratoOps, solicitarCodigoFirmaContrato,
  firmarMiContratoLaboral, solicitarCodigoFirmaContratoLaboral,
} from '../contratos-acciones'

type ContratoItem = {
  id: string
  /** OPS = prestación de servicios; LABORAL = contrato de trabajo. */
  clase: 'OPS' | 'LABORAL'
  numero: string
  objeto: string
  estado: string
  valorTotal: string
  vigencia: string
  documentoId: string | null
  autorizacionId: string | null
  firmadoPorMi: boolean
  fechaMiFirma: string | null
  tieneDocumento: boolean
}

const ESTADO: Record<string, string> = { BORRADOR: 'Borrador', ACTIVO: 'Activo', FIRMADO: 'Firmado', TERMINADO: 'Terminado' }

/** Botón que abre un documento en el visor: ícono representativo + nombre corto. */
function DocBoton({
  documentoId,
  titulo,
  etiqueta,
  Icono,
}: {
  documentoId: string
  titulo: string
  etiqueta: string
  Icono: typeof FileText
}) {
  return (
    <VisorPdf
      documentoId={documentoId}
      titulo={titulo}
      className={buttonVariants({ variant: 'outline', size: 'sm' }) + ' gap-2'}
    >
      <Icono className="size-4 text-primary" />
      {etiqueta}
    </VisorPdf>
  )
}

export function MisContratos({ contratos }: { contratos: ContratoItem[] }) {
  return (
    <div className="space-y-3">
      {contratos.map((c) => <ContratoCard key={c.id} c={c} />)}
    </div>
  )
}

function ContratoCard({ c }: { c: ContratoItem }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [firma, setFirma] = useState<string | null>(null)
  const [g, setG] = useState(false)
  // Paso de autorización previa por código enviado al correo.
  const [codigo, setCodigo] = useState('')
  const [correoEnviado, setCorreoEnviado] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const codigoCompleto = /^\d{6}$/.test(codigo)

  function reiniciar() {
    setAbierto(false)
    setFirma(null)
    setCodigo('')
    setCorreoEnviado(null)
  }

  async function enviarCodigo() {
    setEnviando(true)
    const res = c.clase === 'LABORAL'
      ? await solicitarCodigoFirmaContratoLaboral({ contratoId: c.id })
      : await solicitarCodigoFirmaContrato({ contratoId: c.id })
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
    const res = c.clase === 'LABORAL'
      ? await firmarMiContratoLaboral({ contratoId: c.id, firmaDataUri: firma, codigo })
      : await firmarMiContratoOps({ contratoId: c.id, firmaDataUri: firma, codigo })
    setG(false)
    if (res.ok) {
      toast.success(res.datos.firmado ? 'Contrato y autorización firmados. Ya puedes descargar los documentos.' : 'Firmaste el contrato y la autorización de datos. Falta la firma de la empresa en el contrato.')
      reiniciar()
      router.refresh()
    } else {
      toast.error(res.error)
    }
  }

  return (
    <Card>
      <CardContent className="py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FilePenLine className="size-4 shrink-0 text-muted-foreground" />
            <p className="truncate text-sm font-medium">{c.numero}</p>
            <Badge variant={c.estado === 'FIRMADO' ? 'default' : 'secondary'}>{ESTADO[c.estado] ?? c.estado}</Badge>
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.objeto}</p>
          <p className="mt-1 text-xs text-muted-foreground">{c.vigencia} · {c.valorTotal}</p>
        </div>

        {/* Documentos: botones claros con nombre corto */}
        {(c.documentoId || c.autorizacionId) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {c.documentoId && <DocBoton documentoId={c.documentoId} titulo={`Contrato ${c.numero}`} etiqueta="Contrato" Icono={FileText} />}
            {c.autorizacionId && <DocBoton documentoId={c.autorizacionId} titulo={`Autorización de datos ${c.numero}`} etiqueta="Autorización de datos" Icono={ShieldCheck} />}
          </div>
        )}

        <div className="mt-3 border-t pt-3">
          {c.firmadoPorMi ? (
            <div className="flex items-center gap-1.5 text-sm text-emerald-600">
              <CircleCheck className="size-4" /> Firmaste este contrato{c.fechaMiFirma ? ` el ${c.fechaMiFirma}` : ''}
            </div>
          ) : c.tieneDocumento && c.documentoId ? (
            <Button size="sm" onClick={() => setAbierto(true)}><PenLine className="size-4" /> Revisar y firmar</Button>
          ) : (
            <p className="text-sm text-muted-foreground">Los documentos de este contrato aún no están disponibles. Contacta a Talento Humano.</p>
          )}
        </div>

        <Dialog open={abierto} onOpenChange={(o) => (o ? setAbierto(true) : reiniciar())}>
          <DialogContent className="max-h-[88vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Firmar contrato {c.numero}</DialogTitle>
              <DialogDescription>
                Lee ambos documentos antes de firmar. Tu firma se aplica al contrato y a la autorización de
                tratamiento de datos (Ley 1581); ambos quedan aceptados (firma electrónica, Ley 527 de 1999).
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-wrap gap-2">
              {c.documentoId && <DocBoton documentoId={c.documentoId} titulo={`Contrato ${c.numero}`} etiqueta="Contrato" Icono={FileText} />}
              {c.autorizacionId && <DocBoton documentoId={c.autorizacionId} titulo={`Autorización de datos ${c.numero}`} etiqueta="Autorización de datos" Icono={ShieldCheck} />}
            </div>

            {/* Paso 1: autorización por código enviado al correo */}
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="size-4 text-primary" /> Autoriza tu firma con un código
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Te enviaremos un código de 6 dígitos a tu correo. Escríbelo aquí para confirmar que eres tú quien firma.
              </p>
              {!correoEnviado ? (
                <Button size="sm" variant="outline" className="mt-3" onClick={enviarCodigo} disabled={enviando}>
                  {enviando ? <Spinner /> : <Mail className="size-4" />} Enviar código a mi correo
                </Button>
              ) : (
                <div className="mt-3 space-y-2">
                  <p className="flex items-center gap-1.5 text-xs text-emerald-600">
                    <MailCheck className="size-4" /> Código enviado a {correoEnviado}
                  </p>
                  <div className="flex items-end gap-2">
                    <div className="grow">
                      <Label htmlFor={`codigo-${c.id}`} className="text-xs">Código de 6 dígitos</Label>
                      <Input
                        id={`codigo-${c.id}`}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        placeholder="______"
                        value={codigo}
                        onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        className="tracking-[0.5em] font-mono"
                      />
                    </div>
                    <Button size="sm" variant="ghost" onClick={enviarCodigo} disabled={enviando}>
                      {enviando ? <Spinner /> : 'Reenviar'}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Paso 2: firma */}
            <FirmaCaptura onChange={setFirma} />
            <DialogFooter>
              <Button variant="ghost" onClick={reiniciar}>Cancelar</Button>
              <Button onClick={firmar} disabled={g || !firma || !codigoCompleto}>{g && <Spinner />}Firmar contrato</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
