'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PenLine, CircleCheck, FileText, ShieldCheck, FilePenLine, ChevronDown, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Pill, type PillTone } from '@/components/ui-kit'
import { Button, buttonVariants } from '@/components/ui/button'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PasosFirma } from '@/components/firma/pasos-firma'
import { MisOtrosis, type OtrosiItem } from './mis-otrosis'
import {
  firmarMiContratoOps, solicitarCodigoFirmaContrato,
  firmarMiContratoLaboral, solicitarCodigoFirmaContratoLaboral,
} from '../contratos-acciones'

type ContratoItem = {
  id: string
  /** OPS = prestación de servicios; LABORAL = contrato de trabajo. */
  clase: 'OPS' | 'LABORAL'
  numero: string
  /** Para la tarjeta plegada: cargo/objeto y tipo en una línea, vigencia corta en la otra. */
  resumen: string
  vigenciaCorta: string
  estado: string
  valorTotal: string
  documentoId: string | null
  documentos: { id: string; nombre: string }[]
  firmadoPorMi: boolean
  fechaMiFirma: string | null
  tieneDocumento: boolean
  /** Otrosíes del contrato laboral que se firman en la app (los OPS no tienen). */
  otrosis?: OtrosiItem[]
}

const ESTADO: Record<string, string> = { BORRADOR: 'Borrador', ACTIVO: 'Activo', FIRMADO: 'Firmado', TERMINADO: 'Terminado' }
const TONO: Record<string, PillTone> = { BORRADOR: 'muted', ACTIVO: 'ok', FIRMADO: 'ok', TERMINADO: 'muted' }

/** Sin acentos y en minúsculas: los documentos viejos guardan el nombre del archivo. */
function esAutorizacion(nombre: string): boolean {
  return nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes('autoriz')
}

/**
 * Etiqueta del botón. La autorización se rotula por lo que es; el resto muestra
 * su propio nombre.
 *
 * Rotular todo lo demás como "Contrato" dejaría dos botones idénticos cuando un
 * contrato viejo trae dos PDF con el nombre del archivo escaneado, y el
 * colaborador no sabría cuál abrir. El nombre crudo es feo, pero distingue.
 */
function etiquetaDoc(nombre: string): string {
  return esAutorizacion(nombre) ? 'Autorización de datos' : nombre
}

/** Fila de un documento: ícono, nombre y "Ver", que abre el visor aquí mismo. */
function DocFila({ documentoId, titulo, etiqueta, Icono }: { documentoId: string; titulo: string; etiqueta: string; Icono: typeof FileText }) {
  return (
    <li className="flex items-center gap-2.5 py-1.5 text-sm">
      <Icono className="size-4 shrink-0 text-muted-foreground" />
      {/* Los nombres heredados de archivos escaneados son largos: se recortan. */}
      <span className="min-w-0 flex-1 truncate">{etiqueta}</span>
      <VisorPdf documentoId={documentoId} titulo={titulo} className={buttonVariants({ size: 'sm' }) + ' shrink-0'}>
        <Eye className="size-3.5" /> Ver
      </VisorPdf>
    </li>
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
  // Plegada por defecto: el número, el estado y una línea bastan para ubicarse;
  // los PDF, la fecha de firma y los otrosíes salen al desplegar. Lo único que
  // no se esconde es lo que exige actuar: firmar.
  const [expandido, setExpandido] = useState(false)
  const otrosisPorFirmar = c.otrosis?.filter((o) => !o.firmado && o.documentoId).length ?? 0
  const puedeFirmar = !c.firmadoPorMi && c.tieneDocumento && !!c.documentoId
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
      <CardContent className="py-3">
        <button
          type="button"
          onClick={() => setExpandido((v) => !v)}
          aria-expanded={expandido}
          className="flex w-full items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-foreground text-background">
            <FilePenLine className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-bold">{c.numero}</span>
              <Pill tone={TONO[c.estado] ?? 'muted'}>{ESTADO[c.estado] ?? c.estado}</Pill>
              {otrosisPorFirmar > 0 && <Pill tone="warn">{otrosisPorFirmar} otrosí{otrosisPorFirmar > 1 ? 'es' : ''} por firmar</Pill>}
            </span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{c.resumen}</span>
            <span className="block text-xs text-muted-foreground">{c.vigenciaCorta} · {c.valorTotal}</span>
          </span>
          <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', expandido && 'rotate-180')} />
        </button>

        {puedeFirmar && (
          <Button size="sm" className="mt-3 w-full sm:w-auto" onClick={() => setAbierto(true)}>
            <PenLine className="size-4" /> Revisar y firmar
          </Button>
        )}

        {expandido && (
          <div className="mt-3 space-y-3 border-t pt-3">
            {c.documentos.length > 0 && (
              <ul className="divide-y rounded-lg border px-3">
                {c.documentos.map((d) => (
                  <DocFila
                    key={d.id}
                    documentoId={d.id}
                    titulo={d.nombre}
                    etiqueta={etiquetaDoc(d.nombre)}
                    Icono={esAutorizacion(d.nombre) ? ShieldCheck : FileText}
                  />
                ))}
              </ul>
            )}

            {c.firmadoPorMi ? (
              <p className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
                <CircleCheck className="size-4" /> Firmado por ti{c.fechaMiFirma ? ` el ${c.fechaMiFirma}` : ''}
              </p>
            ) : !puedeFirmar ? (
              <p className="text-xs text-muted-foreground">Los documentos de este contrato aún no están disponibles. Contacta a Talento Humano.</p>
            ) : null}

            {c.otrosis && c.otrosis.length > 0 && <MisOtrosis otrosis={c.otrosis} contratoNumero={c.numero} />}
          </div>
        )}

        <Dialog open={abierto} onOpenChange={(o) => (o ? setAbierto(true) : reiniciar())}>
          {/* Sin párrafo bajo el título: los tres pasos numerados dicen qué
              hacer, y la nota legal va corta junto al botón de firmar. */}
          <DialogContent className="max-h-[88vh] overflow-y-auto" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Firmar contrato {c.numero}</DialogTitle>
            </DialogHeader>
            <PasosFirma
              documentos={c.documentos.map((d) => ({ id: d.id, titulo: d.nombre, etiqueta: etiquetaDoc(d.nombre), icono: esAutorizacion(d.nombre) ? ShieldCheck : FileText }))}
              correoEnviado={correoEnviado}
              enviando={enviando}
              onEnviarCodigo={enviarCodigo}
              codigo={codigo}
              onCodigo={setCodigo}
              onFirma={setFirma}
              idCodigo={`codigo-${c.id}`}
            />
            <p className="text-[11px] leading-snug text-muted-foreground">
              Al firmar aceptas el contrato y la autorización de tratamiento de datos (firma electrónica, Ley 527 de 1999).
            </p>
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
