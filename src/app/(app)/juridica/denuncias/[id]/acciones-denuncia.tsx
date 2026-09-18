'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Search, CircleCheck, Archive, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TIPOS_CLASIFICABLES, type TipoClasificable } from '@/lib/linea-etica'
import { iniciarInvestigacionDenuncia, resolverDenuncia, archivarDenuncia, vincularResolucionDenuncia, clasificarDenuncia } from '../../acciones'
import { ZonaArchivos, subirArchivoEntidad } from '../../_ui'

export function AccionesDenuncia({ id, estado, tipo }: { id: string; estado: string; tipo: string }) {
  const router = useRouter()
  const [g, setG] = useState(false)
  const [dialogo, setDialogo] = useState<'resolver' | 'archivar' | null>(null)
  const [tipoElegido, setTipoElegido] = useState(tipo === 'SIN_CLASIFICAR' ? '' : tipo)
  const [clasificando, setClasificando] = useState(false)

  // Quien reporta no elige el tipo; lo decide Jurídica al leerlo. De eso
  // depende el camino: los de acoso van al Comité de Convivencia (Ley 1010).
  async function clasificar() {
    if (!tipoElegido) { toast.error('Elige el tipo.'); return }
    setClasificando(true)
    const res = await clasificarDenuncia({ id, tipo: tipoElegido as TipoClasificable })
    setClasificando(false)
    if (res.ok) { toast.success('Reporte clasificado.'); router.refresh() } else toast.error(res.error)
  }

  async function iniciar() {
    setG(true)
    const res = await iniciarInvestigacionDenuncia({ id })
    setG(false)
    if (res.ok) { toast.success('Investigación iniciada.'); router.refresh() } else toast.error(res.error)
  }

  return (
    <Card><CardContent className="py-4 space-y-3">
      <h3 className="text-sm font-medium">Gestión de la denuncia</h3>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 space-y-1.5">
          <Label>Tipo {tipo === 'SIN_CLASIFICAR' && <span className="text-destructive">*</span>}</Label>
          <Select value={tipoElegido} onValueChange={setTipoElegido}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Por clasificar…" /></SelectTrigger>
            <SelectContent>{TIPOS_CLASIFICABLES.map((t) => <SelectItem key={t.valor} value={t.valor}>{t.etiqueta}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={clasificar} disabled={clasificando || !tipoElegido || tipoElegido === tipo}>
          {clasificando ? <Spinner /> : <Tag className="size-4" />} {tipo === 'SIN_CLASIFICAR' ? 'Clasificar' : 'Cambiar tipo'}
        </Button>
      </div>
      {estado === 'RECIBIDA' && (
        <>
          <p className="text-sm text-muted-foreground">Denuncia recibida. Inicia la investigación para continuar, o archívala si no procede.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={iniciar} disabled={g}>{g ? <Spinner /> : <Search className="size-4" />} Iniciar investigación</Button>
            <Button size="sm" onClick={() => setDialogo('archivar')}><Archive className="size-4" /> Archivar</Button>
          </div>
        </>
      )}
      {estado === 'EN_INVESTIGACION' && (
        <>
          <p className="text-sm text-muted-foreground">En investigación. Al terminar, resuélvela con una conclusión (y el acuerdo final si aplica) o archívala.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setDialogo('resolver')}><CircleCheck className="size-4" /> Resolver</Button>
            <Button size="sm" onClick={() => setDialogo('archivar')}><Archive className="size-4" /> Archivar</Button>
          </div>
        </>
      )}
      {dialogo === 'resolver' && <DialogResolver id={id} onClose={() => setDialogo(null)} onDone={() => { setDialogo(null); router.refresh() }} />}
      {dialogo === 'archivar' && <DialogArchivar id={id} onClose={() => setDialogo(null)} onDone={() => { setDialogo(null); router.refresh() }} />}
    </CardContent></Card>
  )
}

function DialogResolver({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const [resolucion, setResolucion] = useState('')
  const [acuerdo, setAcuerdo] = useState<File[]>([])
  const [g, setG] = useState(false)
  async function confirmar() {
    if (resolucion.trim().length < 5) { toast.error('Escribe la conclusión.'); return }
    setG(true)
    try {
      const res = await resolverDenuncia({ id, resolucion })
      if (!res.ok) throw new Error(res.error)
      if (acuerdo[0]) {
        const docId = await subirArchivoEntidad('DenunciaAcoso', id, acuerdo[0], 'Acuerdo / resolución final')
        const rv = await vincularResolucionDenuncia({ id, documentoId: docId })
        if (!rv.ok) throw new Error(rv.error)
      }
      toast.success('Denuncia resuelta.'); onDone()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo resolver.') } finally { setG(false) }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent>
      <DialogHeader><DialogTitle>Resolver denuncia</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5"><Label>Conclusión de la investigación</Label><Textarea rows={3} value={resolucion} onChange={(e) => setResolucion(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Acuerdo / resolución final (opcional — PDF)</Label><ZonaArchivos archivos={acuerdo} onChange={setAcuerdo} multiple={false} accept="image/*,application/pdf" /></div>
      </div>
      <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={confirmar} disabled={g}>{g && <Spinner />}Resolver</Button></DialogFooter>
    </DialogContent></Dialog>
  )
}

function DialogArchivar({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const [motivo, setMotivo] = useState('')
  const [g, setG] = useState(false)
  async function confirmar() {
    if (motivo.trim().length < 5) { toast.error('Indica el motivo.'); return }
    setG(true)
    const res = await archivarDenuncia({ id, motivo })
    setG(false)
    if (res.ok) { toast.success('Denuncia archivada.'); onDone() } else toast.error(res.error)
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent>
      <DialogHeader><DialogTitle>Archivar denuncia</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5"><Label>Motivo del archivo</Label><Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></div>
      </div>
      <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={confirmar} disabled={g}>{g && <Spinner />}Archivar</Button></DialogFooter>
    </DialogContent></Dialog>
  )
}
