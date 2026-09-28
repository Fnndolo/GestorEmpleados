'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PenLine, CircleCheck, FileText, ShieldCheck } from 'lucide-react'
import { Pill } from '@/components/ui-kit'
import { Button } from '@/components/ui/button'
import { TarjetaContrato, esAutorizacion, etiquetaDoc } from '@/components/contratos/tarjeta-contrato'
import type { FirmaContrato } from '@/lib/contratos/tarjeta'
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
  firma: FirmaContrato
  valorTotal: string
  documentoId: string | null
  documentos: { id: string; nombre: string }[]
  firmadoPorMi: boolean
  fechaMiFirma: string | null
  tieneDocumento: boolean
  /** Otrosíes del contrato laboral que se firman en la app (los OPS no tienen). */
  otrosis?: OtrosiItem[]
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
    <>
      <TarjetaContrato
        c={{ ...c, valor: c.valorTotal }}
        etiquetas={otrosisPorFirmar > 0 && <Pill tone="warn">{otrosisPorFirmar} otrosí{otrosisPorFirmar > 1 ? 'es' : ''} por firmar</Pill>}
        accion={puedeFirmar && (
          <Button size="sm" className="w-full sm:w-auto" onClick={() => setAbierto(true)}>
            <PenLine className="size-4" /> Revisar y firmar
          </Button>
        )}
      >
        {c.firmadoPorMi ? (
          <p className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
            <CircleCheck className="size-4" /> Firmado por ti{c.fechaMiFirma ? ` el ${c.fechaMiFirma}` : ''}
          </p>
        ) : !puedeFirmar ? (
          <p className="text-xs text-muted-foreground">Los documentos de este contrato aún no están disponibles. Contacta a Talento Humano.</p>
        ) : null}

        {c.otrosis && c.otrosis.length > 0 && <MisOtrosis otrosis={c.otrosis} contratoNumero={c.numero} />}
      </TarjetaContrato>

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
    </>
  )
}
