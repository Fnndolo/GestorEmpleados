'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, HardHat, Laptop, PenLine, Shirt, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FirmaCaptura } from '@/components/firma/firma-captura'
import { VisorPdf } from '@/components/documentos/visor-pdf'
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
  fechaEntrega: string; fechaDevolucion: string | null
  actaEntregaDocId: string | null; actaDevolucionDocId: string | null
  firmaEntregaEn: string | null
}

export function MiDotacion({ entregas, activos, epps }: { entregas: Entrega[]; activos: ActivoAsignado[]; epps: EntregaEpp[] }) {
  const router = useRouter()
  const [firmando, setFirmando] = useState<Entrega | null>(null)
  const [firmandoActa, setFirmandoActa] = useState<ActivoAsignado | null>(null)
  const [firmandoEpp, setFirmandoEpp] = useState<EntregaEpp | null>(null)

  const aCargo = activos.filter((a) => !a.fechaDevolucion)
  const devueltos = activos.filter((a) => a.fechaDevolucion)

  // Prioridad: primero lo que exige acción (firmar), luego lo vigente, al final el historial.
  const activosPorFirmar = aCargo.filter((a) => !a.firmaEntregaEn)
  const dotacionPorFirmar = entregas.filter((e) => !e.firmadoEn)
  const eppPorFirmar = epps.filter((e) => !e.firmadoEn)
  const porFirmar = activosPorFirmar.length + dotacionPorFirmar.length + eppPorFirmar.length
  const activosFirmados = aCargo.filter((a) => a.firmaEntregaEn)
  const dotacionFirmada = entregas.filter((e) => e.firmadoEn)
  const eppFirmados = epps.filter((e) => e.firmadoEn)

  const filaActivo = (a: ActivoAsignado) => (
    <div key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-teal-500/12 text-teal-600 dark:text-teal-400">
        <Laptop className="size-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {a.nombre} <span className="text-xs font-normal text-muted-foreground">({a.codigo})</span>
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {a.tipo}{a.marca ? ` · ${a.marca}` : ''}{a.serie ? ` · serie ${a.serie}` : ''} · a tu cargo desde {a.fechaEntrega}
        </p>
        <div className="mt-1">
          {a.firmaEntregaEn
            ? <Badge className="bg-emerald-500/12 text-[10px] text-emerald-700 dark:text-emerald-400" variant="secondary">Acta firmada · {a.firmaEntregaEn}</Badge>
            : <Badge className="bg-amber-500/12 text-[10px] text-amber-700 dark:text-amber-400" variant="secondary">Acta pendiente de firma</Badge>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {a.actaEntregaDocId && (
          <VisorPdf documentoId={a.actaEntregaDocId} titulo={`Acta de entrega — ${a.nombre}`} className="whitespace-nowrap text-xs text-primary hover:underline">
            Ver acta
          </VisorPdf>
        )}
        {!a.firmaEntregaEn && (
          <Button size="sm" onClick={() => setFirmandoActa(a)}>
            <PenLine className="size-4" /> Firmar acta
          </Button>
        )}
      </div>
    </div>
  )

  const filaDotacion = (e: Entrega) => (
    <div key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-indigo-500/12 text-indigo-600 dark:text-indigo-400">
        <Shirt className="size-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          Dotación {e.corte} {e.anio}
          {e.firmadoEn
            ? <Badge className="bg-emerald-500/12 text-[10px] text-emerald-700 dark:text-emerald-400" variant="secondary">Firmado · {e.firmadoEn}</Badge>
            : <Badge className="bg-amber-500/12 text-[10px] text-amber-700 dark:text-amber-400" variant="secondary">Pendiente de firma</Badge>}
        </p>
        <p className="truncate text-xs text-muted-foreground">{e.items} · entregada {e.fechaEntrega}</p>
      </div>
      {e.recibidoDocId && (
        <VisorPdf documentoId={e.recibidoDocId} titulo={`Recibido de dotación ${e.corte} ${e.anio}`} className="text-xs text-primary hover:underline">
          Ver recibido
        </VisorPdf>
      )}
      {!e.firmadoEn && (
        <Button size="sm" onClick={() => setFirmando(e)}>
          <PenLine className="size-4" /> Firmar recibido
        </Button>
      )}
    </div>
  )

  const filaEpp = (e: EntregaEpp) => (
    <div key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-amber-500/12 text-amber-600 dark:text-amber-400">
        <HardHat className="size-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{e.cantidad}× {e.elemento}{e.reposicion ? ' (reposición)' : ''}</p>
        <p className="truncate text-xs text-muted-foreground">Elemento de protección · entregado el {e.fechaEntrega}</p>
        <div className="mt-1">
          {e.firmadoEn
            ? <Badge className="bg-emerald-500/12 text-[10px] text-emerald-700 dark:text-emerald-400" variant="secondary">Firmado · {e.firmadoEn}</Badge>
            : <Badge className="bg-amber-500/12 text-[10px] text-amber-700 dark:text-amber-400" variant="secondary">Pendiente de firma</Badge>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {e.soporteDocId && (
          <VisorPdf documentoId={e.soporteDocId} titulo={`Recibido EPP — ${e.elemento}`} className="whitespace-nowrap text-xs text-primary hover:underline">
            Ver recibido
          </VisorPdf>
        )}
        {!e.firmadoEn && (
          <Button size="sm" onClick={() => setFirmandoEpp(e)}>
            <PenLine className="size-4" /> Firmar recibido
          </Button>
        )}
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* ── 1. Lo que exige tu acción: pendientes de firma ── */}
      {porFirmar > 0 && (
        <section>
          <h2 className="mb-2 text-[13px] font-bold text-amber-600 dark:text-amber-400">Por firmar ({porFirmar})</h2>
          <Card className="border-amber-500/40"><CardContent className="divide-y p-0">
            {activosPorFirmar.map(filaActivo)}
            {dotacionPorFirmar.map(filaDotacion)}
            {eppPorFirmar.map(filaEpp)}
            <p className="px-4 py-2.5 text-xs text-muted-foreground">
              Tu firma digital queda incrustada en el PDF y la constancia se guarda en tu expediente.
            </p>
          </CardContent></Card>
        </section>
      )}

      {/* ── 2. Lo vigente, ya al día ── */}
      <section>
        <h2 className="mb-2 text-[13px] font-bold">Activos a tu cargo ({aCargo.length})</h2>
        {activosFirmados.length === 0 ? (
          <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">
            {activosPorFirmar.length > 0 ? 'Tus activos asignados están arriba, pendientes de firma.' : 'No tienes activos asignados actualmente.'}
          </CardContent></Card>
        ) : (
          <Card><CardContent className="divide-y p-0">
            {activosFirmados.map(filaActivo)}
            <p className="px-4 py-2.5 text-xs text-muted-foreground">
              Estos activos deben devolverse al finalizar la relación laboral o cuando la empresa lo requiera; hacen parte de tu paz y salvo.
            </p>
          </CardContent></Card>
        )}
      </section>

      {(dotacionFirmada.length > 0 || dotacionPorFirmar.length === 0) && (
        <section>
          <h2 className="mb-2 text-[13px] font-bold">Dotación de labor</h2>
          {dotacionFirmada.length === 0 ? (
            <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">
              Aún no tienes entregas de dotación registradas.
            </CardContent></Card>
          ) : (
            <Card><CardContent className="divide-y p-0">{dotacionFirmada.map(filaDotacion)}</CardContent></Card>
          )}
        </section>
      )}

      {(eppFirmados.length > 0 || eppPorFirmar.length === 0) && (
        <section>
          <h2 className="mb-2 text-[13px] font-bold">Elementos de protección personal (EPP)</h2>
          {eppFirmados.length === 0 ? (
            <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">
              Aún no tienes entregas de EPP registradas.
            </CardContent></Card>
          ) : (
            <Card><CardContent className="divide-y p-0">{eppFirmados.map(filaEpp)}</CardContent></Card>
          )}
        </section>
      )}

      {/* ── 3. Historial ── */}
      {devueltos.length > 0 && (
        <section>
          <h2 className="mb-2 text-[13px] font-bold">Activos devueltos</h2>
          <Card><CardContent className="divide-y p-0">
            {devueltos.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 opacity-80">
                <Undo2 className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{a.nombre} <span className="text-xs text-muted-foreground">({a.codigo})</span></p>
                  <p className="text-xs text-muted-foreground">Devuelto el {a.fechaDevolucion}</p>
                </div>
                {a.actaDevolucionDocId && (
                  <VisorPdf documentoId={a.actaDevolucionDocId} titulo={`Acta de devolución — ${a.nombre}`} className="text-xs text-primary hover:underline">
                    Ver acta
                  </VisorPdf>
                )}
              </div>
            ))}
          </CardContent></Card>
        </section>
      )}

      {firmando && (
        <DialogFirma
          entrega={firmando}
          onClose={() => setFirmando(null)}
          onDone={() => { setFirmando(null); router.refresh() }}
        />
      )}
      {firmandoActa && (
        <DialogFirmaActa
          activo={firmandoActa}
          onClose={() => setFirmandoActa(null)}
          onDone={() => { setFirmandoActa(null); router.refresh() }}
        />
      )}
      {firmandoEpp && (
        <DialogFirmaEpp
          entrega={firmandoEpp}
          onClose={() => setFirmandoEpp(null)}
          onDone={() => { setFirmandoEpp(null); router.refresh() }}
        />
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
          <DialogTitle>Firmar recibido de EPP — {entrega.elemento}</DialogTitle>
          <DialogDescription>
            Declaras haber recibido {entrega.cantidad}× {entrega.elemento} en buen estado y te comprometes a usarlos
            en tus labores (Decreto 1072 de 2015). Tu firma queda incrustada en el PDF.
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
          <DialogTitle>Firmar acta de entrega — {activo.nombre}</DialogTitle>
          <DialogDescription>
            Declaras haber recibido {activo.nombre} ({activo.codigo}) y te comprometes a custodiarlo y devolverlo
            cuando la empresa lo requiera. Tu firma queda incrustada en el PDF del acta.
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
            Declaras haber recibido a satisfacción: {entrega.items}. Tu firma queda incrustada en el PDF del recibido.
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
