'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, PenLine, Eye, ChevronDown, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FirmaCaptura } from '@/components/firma/firma-captura'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { cn } from '@/lib/utils'
import { Pill } from '@/components/ui-kit'
import { iconoActivo, iconoEpp, ICONO_DOTACION } from '@/lib/activos-visual'
import { firmarRecibidoDotacion, firmarActaEntrega } from '../../activos/acciones'
import { firmarRecibidoEpp } from '../../sst/acciones'

type Entrega = {
  id: string; anio: number; corte: string; items: string
  fechaEntrega: string; firmadoEn: string | null; recibidoDocId: string | null
}
type EntregaEpp = {
  id: string; elemento: string; cantidad: number; reposicion: boolean
  fechaEntrega: string; firmadoEn: string | null; soporteDocId: string | null
}
type ActivoAsignado = {
  id: string; nombre: string; codigo: string; tipo: string; marca: string | null; serie: string | null
  fotoUrl: string | null
  fechaEntrega: string; fechaDevolucion: string | null
  actaEntregaDocId: string | null; actaDevolucionDocId: string | null
  firmaEntregaEn: string | null
  /** Nº de activos que cubre la misma acta; >1 si se entregaron en un solo acto. */
  activosEnActa: number
}

const GRUPOS = [
  { v: 'activos', l: 'Activos a tu cargo' },
  { v: 'dotacion', l: 'Dotación de labor' },
  { v: 'epp', l: 'Elementos de protección' },
] as const
type Grupo = (typeof GRUPOS)[number]['v']

/**
 * Lo que la empresa le ha entregado a la persona, en tres pestañas y como
 * lista con miniatura: la foto del activo si Talento Humano la subió, o el
 * ícono de lo que es. Cada fila dice si el acta o el recibido ya está
 * firmado y, si no, deja firmarlo ahí mismo.
 */
export function MiDotacion({ entregas, activos, epps, verDotacion, verEpp }: {
  entregas: Entrega[]; activos: ActivoAsignado[]; epps: EntregaEpp[]
  /** Un contratista OPS no recibe dotación ni EPP: esas pestañas no se muestran. */
  verDotacion: boolean; verEpp: boolean
}) {
  const router = useRouter()
  const [grupo, setGrupo] = useState<Grupo>('activos')
  const [verDevueltos, setVerDevueltos] = useState(false)
  const [firmando, setFirmando] = useState<Entrega | null>(null)
  const [firmandoActa, setFirmandoActa] = useState<ActivoAsignado | null>(null)
  const [firmandoEpp, setFirmandoEpp] = useState<EntregaEpp | null>(null)

  const aCargo = activos.filter((a) => !a.fechaDevolucion)
  const devueltos = activos.filter((a) => a.fechaDevolucion)
  // Lo pendiente de firma va primero en cada pestaña; el contador de la pestaña lo avisa.
  const porFirmar: Record<Grupo, number> = {
    activos: aCargo.filter((a) => !a.firmaEntregaEn).length,
    dotacion: entregas.filter((e) => !e.firmadoEn).length,
    epp: epps.filter((e) => !e.firmadoEn).length,
  }
  const cantidad: Record<Grupo, number> = { activos: aCargo.length, dotacion: entregas.length, epp: epps.length }
  const grupos = GRUPOS.filter((g) => (g.v === 'dotacion' ? verDotacion : g.v === 'epp' ? verEpp : true))
  const primero = <T extends { firmado: boolean }>(xs: T[]) => [...xs].sort((a, b) => Number(a.firmado) - Number(b.firmado))

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {grupos.map((g) => (
          <button
            key={g.v}
            type="button"
            onClick={() => setGrupo(g.v)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors',
              grupo === g.v ? 'bg-foreground text-background' : 'border bg-card text-muted-foreground hover:bg-accent',
            )}
          >
            {g.l}
            {cantidad[g.v] > 0 && <span className={cn('tabular-nums', grupo === g.v ? 'opacity-70' : '')}>{cantidad[g.v]}</span>}
            {porFirmar[g.v] > 0 && <span className="size-1.5 rounded-full bg-amber-500" aria-label="Con pendientes de firma" />}
          </button>
        ))}
      </div>

      {grupo === 'activos' && (
        <>
          {aCargo.length === 0 ? (
            <Vacio texto="No tienes activos a tu cargo." />
          ) : (
            <Lista>
              {primero(aCargo.map((a) => ({ ...a, firmado: Boolean(a.firmaEntregaEn) }))).map((a) => (
                <Fila
                  key={a.id}
                  fotoUrl={a.fotoUrl}
                  icono={iconoActivo(a.tipo, a.nombre)}
                  titulo={a.nombre}
                  detalle={[a.tipo, a.marca, a.serie ? `serie ${a.serie}` : null].filter(Boolean).join(' · ')}
                  fecha={`Desde ${a.fechaEntrega} · ${a.codigo}`}
                  firmado={a.firmaEntregaEn}
                  nota={a.activosEnActa > 1 ? `Una sola acta para ${a.activosEnActa} activos` : null}
                  documento={a.actaEntregaDocId ? { id: a.actaEntregaDocId, titulo: `Acta de entrega — ${a.nombre}` } : null}
                  onFirmar={() => setFirmandoActa(a)}
                  textoFirmar="Firmar acta"
                />
              ))}
            </Lista>
          )}
          {devueltos.length > 0 && (
            <div className="mt-4">
              <button type="button" onClick={() => setVerDevueltos((v) => !v)} aria-expanded={verDevueltos} className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                Devueltos ({devueltos.length}) <ChevronDown className={cn('size-3.5 transition-transform', verDevueltos && 'rotate-180')} />
              </button>
              {verDevueltos && (
                <Lista className="mt-2 opacity-75">
                  {devueltos.map((a) => (
                    <Fila
                      key={a.id}
                      fotoUrl={a.fotoUrl}
                      icono={iconoActivo(a.tipo, a.nombre)}
                      titulo={a.nombre}
                      detalle={[a.tipo, a.marca].filter(Boolean).join(' · ')}
                      fecha={`Devuelto el ${a.fechaDevolucion}`}
                      firmado={a.fechaDevolucion}
                      etiquetaFirmado="Devuelto"
                      documento={a.actaDevolucionDocId ? { id: a.actaDevolucionDocId, titulo: `Acta de devolución — ${a.nombre}` } : null}
                    />
                  ))}
                </Lista>
              )}
            </div>
          )}
        </>
      )}

      {grupo === 'dotacion' && (
        entregas.length === 0 ? <Vacio texto="Aún no tienes entregas de dotación." /> : (
          <Lista>
            {primero(entregas.map((e) => ({ ...e, firmado: Boolean(e.firmadoEn) }))).map((e) => (
              <Fila
                key={e.id}
                fotoUrl={null}
                icono={ICONO_DOTACION}
                titulo={`Dotación ${e.corte} ${e.anio}`}
                detalle={e.items}
                fecha={`Entregada el ${e.fechaEntrega}`}
                firmado={e.firmadoEn}
                documento={e.recibidoDocId ? { id: e.recibidoDocId, titulo: `Recibido de dotación ${e.corte} ${e.anio}` } : null}
                onFirmar={() => setFirmando(e)}
                textoFirmar="Firmar recibido"
              />
            ))}
          </Lista>
        )
      )}

      {grupo === 'epp' && (
        epps.length === 0 ? <Vacio texto="Aún no tienes entregas de elementos de protección." /> : (
          <Lista>
            {primero(epps.map((e) => ({ ...e, firmado: Boolean(e.firmadoEn) }))).map((e) => (
              <Fila
                key={e.id}
                fotoUrl={null}
                icono={iconoEpp(e.elemento)}
                titulo={`${e.cantidad}× ${e.elemento}`}
                detalle={e.reposicion ? 'Reposición' : 'Elemento de protección personal'}
                fecha={`Entregado el ${e.fechaEntrega}`}
                firmado={e.firmadoEn}
                documento={e.soporteDocId ? { id: e.soporteDocId, titulo: `Recibido EPP — ${e.elemento}` } : null}
                onFirmar={() => setFirmandoEpp(e)}
                textoFirmar="Firmar recibido"
              />
            ))}
          </Lista>
        )
      )}

      {firmando && (
        <DialogFirma entrega={firmando} onClose={() => setFirmando(null)} onDone={() => { setFirmando(null); router.refresh() }} />
      )}
      {firmandoActa && (
        <DialogFirmaActa activo={firmandoActa} onClose={() => setFirmandoActa(null)} onDone={() => { setFirmandoActa(null); router.refresh() }} />
      )}
      {firmandoEpp && (
        <DialogFirmaEpp entrega={firmandoEpp} onClose={() => setFirmandoEpp(null)} onDone={() => { setFirmandoEpp(null); router.refresh() }} />
      )}
    </div>
  )
}

function Vacio({ texto }: { texto: string }) {
  return <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">{texto}</CardContent></Card>
}

function Lista({ children, className }: { children: React.ReactNode; className?: string }) {
  return <Card className={className}><CardContent className="divide-y p-0">{children}</CardContent></Card>
}

// No pasa por next/image: la sirve nuestra ruta con sesión, no un CDN.
// eslint-disable-next-line @next/next/no-img-element
const Foto = ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} className="size-full object-cover" loading="lazy" />

/**
 * Una entrega como fila: la miniatura (foto o ícono), el nombre, un detalle,
 * la fecha y el estado de la firma; a la derecha, ver la constancia o firmar.
 */
function Fila({ fotoUrl, icono: Icono, titulo, detalle, fecha, firmado, etiquetaFirmado = 'Firmado', nota, documento, onFirmar, textoFirmar = 'Firmar' }: {
  fotoUrl: string | null
  icono: LucideIcon
  titulo: string
  detalle: string
  fecha: string
  /** Fecha de la firma, o null si está pendiente. */
  firmado: string | null
  etiquetaFirmado?: string
  nota?: string | null
  documento: { id: string; titulo: string } | null
  onFirmar?: () => void
  textoFirmar?: string
}) {
  return (
    <div className="flex items-center gap-3 p-3">
      <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-foreground text-background">
        {fotoUrl ? <Foto src={fotoUrl} alt={titulo} /> : <Icono className="size-6" strokeWidth={1.75} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold leading-tight">
          <span className="truncate">{titulo}</span>
          {firmado ? <Pill tone="ok">{etiquetaFirmado}</Pill> : <Pill tone="warn">Por firmar</Pill>}
        </p>
        {detalle && <p className="truncate text-xs text-muted-foreground">{detalle}</p>}
        <p className="truncate text-[11px] text-muted-foreground">
          {fecha}{firmado && onFirmar ? ` · firmado ${firmado}` : ''}{nota ? ` · ${nota}` : ''}
        </p>
      </div>
      {(documento || (!firmado && onFirmar)) && (
        <div className="flex shrink-0 items-center gap-1.5">
          {documento && (
            <VisorPdf documentoId={documento.id} titulo={documento.titulo} className="inline-flex size-8 items-center justify-center rounded-md border bg-card hover:bg-accent">
              <Eye className="size-4" /><span className="sr-only">Ver la constancia</span>
            </VisorPdf>
          )}
          {!firmado && onFirmar && (
            <Button size="sm" className="h-8 px-2.5 text-xs" onClick={onFirmar}>
              <PenLine className="size-3.5" /> {textoFirmar}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function DialogFirmaEpp({ entrega, onClose, onDone }: { entrega: EntregaEpp; onClose: () => void; onDone: () => void }) {
  const [firma, setFirma] = useState<string | null>(null)
  const [g, setG] = useState(false)

  async function firmar() {
    if (!firma) { toast.error('Dibuja tu firma para continuar.'); return }
    setG(true)
    const res = await firmarRecibidoEpp({ entregaId: entrega.id, firmaDataUri: firma })
    setG(false)
    if (res.ok) { toast.success('Recibido firmado. La constancia quedó en tu expediente.'); onDone() }
    else toast.error(res.error)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Firmar recibido — {entrega.elemento}</DialogTitle>
          <DialogDescription>
            Declaras haber recibido {entrega.cantidad}× {entrega.elemento} en buen estado y te comprometes a usarlos en tus labores. Tu firma queda en el PDF.
          </DialogDescription>
        </DialogHeader>
        <FirmaCaptura onChange={setFirma} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={firmar} disabled={g}>{g ? <Spinner /> : <Check className="size-4" />} Firmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DialogFirmaActa({ activo, onClose, onDone }: { activo: ActivoAsignado; onClose: () => void; onDone: () => void }) {
  const [firma, setFirma] = useState<string | null>(null)
  const [g, setG] = useState(false)

  async function firmar() {
    if (!firma) { toast.error('Dibuja tu firma para continuar.'); return }
    setG(true)
    const res = await firmarActaEntrega({ asignacionId: activo.id, firmaDataUri: firma })
    setG(false)
    if (res.ok) { toast.success('Acta firmada. La constancia quedó en tu expediente.'); onDone() }
    else toast.error(res.error)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Firmar acta — {activo.nombre}</DialogTitle>
          <DialogDescription>
            Declaras haber recibido {activo.nombre} ({activo.codigo}) y te comprometes a cuidarlo y devolverlo cuando la empresa lo requiera. Tu firma queda en el PDF del acta.
          </DialogDescription>
        </DialogHeader>
        <FirmaCaptura onChange={setFirma} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={firmar} disabled={g}>{g ? <Spinner /> : <Check className="size-4" />} Firmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DialogFirma({ entrega, onClose, onDone }: { entrega: Entrega; onClose: () => void; onDone: () => void }) {
  const [firma, setFirma] = useState<string | null>(null)
  const [g, setG] = useState(false)

  async function firmar() {
    if (!firma) { toast.error('Dibuja tu firma para continuar.'); return }
    setG(true)
    const res = await firmarRecibidoDotacion({ entregaId: entrega.id, firmaDataUri: firma })
    setG(false)
    if (res.ok) { toast.success('Recibido firmado. La constancia quedó en tu expediente.'); onDone() }
    else toast.error(res.error)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Firmar recibido — {entrega.corte} {entrega.anio}</DialogTitle>
          <DialogDescription>
            Declaras haber recibido a satisfacción: {entrega.items}. Tu firma queda en el PDF del recibido.
          </DialogDescription>
        </DialogHeader>
        <FirmaCaptura onChange={setFirma} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={firmar} disabled={g}>{g ? <Spinner /> : <Check className="size-4" />} Firmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
