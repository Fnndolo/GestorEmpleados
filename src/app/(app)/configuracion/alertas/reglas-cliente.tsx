'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Save, Plus } from 'lucide-react'
import { guardarReglaAlerta, crearReglaAlerta, eliminarReglaAlerta } from './acciones'
import { ORIGENES_ALERTA, ETIQUETA_ORIGEN, nombreRegla, type OrigenAlerta } from '@/lib/origenes-vencimiento'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BotonEliminar } from '@/components/ui-kit/boton-eliminar'
import { Ayuda } from '@/components/ui-kit/ayuda'

type Regla = {
  id: string; clave: string; descripcion: string
  diasPrimeraAlerta: number; primeraEnHabiles: boolean
  diasUltimaAlerta: number; ultimaEnHabiles: boolean
}

export function ReglasAlertaCliente({ reglas, puedeCrear, puedeEditar, puedeEliminar }: {
  reglas: Regla[]; puedeCrear: boolean; puedeEditar: boolean; puedeEliminar: boolean
}) {
  const [creando, setCreando] = useState(false)
  const global = reglas.find((r) => r.clave === 'GLOBAL')
  // Solo se ofrecen los tipos que todavía heredan la global.
  const disponibles = ORIGENES_ALERTA.filter((o) => !reglas.some((r) => r.clave === o))

  return (
    <div className="space-y-4">
      {puedeCrear && disponibles.length > 0 && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setCreando(true)}>
            <Plus className="size-4" /> Regla para un tipo
          </Button>
        </div>
      )}

      {reglas.map((r) => (
        <TarjetaRegla key={r.id} regla={r} puedeEditar={puedeEditar} puedeEliminar={puedeEliminar} />
      ))}

      {/* Lo que todavía no tiene regla propia: se dice, en vez de dejar que se
          suponga que cada tipo avisa con sus propios días. */}
      {disponibles.length > 0 && global && (
        <p className="text-xs text-muted-foreground">
          Los demás tipos ({disponibles.map((o) => ETIQUETA_ORIGEN[o].toLowerCase()).join(', ')}) avisan con la
          regla global: {global.diasPrimeraAlerta} y {global.diasUltimaAlerta} días antes.
        </p>
      )}

      {creando && <DialogNuevaRegla disponibles={disponibles} onClose={() => setCreando(false)} />}
    </div>
  )
}

function TarjetaRegla({ regla, puedeEditar, puedeEliminar }: {
  regla: Regla; puedeEditar: boolean; puedeEliminar: boolean
}) {
  const router = useRouter()
  const [estado, setEstado] = useState(regla)
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    if (estado.diasUltimaAlerta > estado.diasPrimeraAlerta) {
      toast.error('La última alerta debe ir después de la primera: pon menos días de anticipación que en la primera.')
      return
    }
    setGuardando(true)
    const res = await guardarReglaAlerta({
      id: regla.id,
      diasPrimeraAlerta: estado.diasPrimeraAlerta,
      primeraEnHabiles: estado.primeraEnHabiles,
      diasUltimaAlerta: estado.diasUltimaAlerta,
      ultimaEnHabiles: estado.ultimaEnHabiles,
    })
    setGuardando(false)
    if (res.ok) {
      const n = (res.datos as { reprogramados: number } | undefined)?.reprogramados ?? 0
      toast.success(n > 0 ? `Regla guardada. Se reprogramaron ${n} vencimiento(s) ya registrados.` : 'Regla guardada.')
      router.refresh()
    }
    else toast.error(res.error)
  }

  async function eliminar() {
    if (!confirm(`¿Eliminar la regla de "${nombreRegla(regla.clave)}"? Ese tipo pasará a usar la regla global.`)) return
    const res = await eliminarReglaAlerta({ id: regla.id })
    if (res.ok) { toast.success('Regla eliminada; el tipo vuelve a la regla global.'); router.refresh() }
    else toast.error(res.error)
  }

  const esGlobal = regla.clave === 'GLOBAL'

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
        <div className="min-w-0">
          <CardTitle className="text-base">{nombreRegla(regla.clave)}</CardTitle>
          <p className="text-xs text-muted-foreground">{regla.descripcion}</p>
        </div>
        {puedeEliminar && (
          <BotonEliminar
            onEliminar={eliminar}
            motivoBloqueo={esGlobal ? 'La regla global no se puede eliminar: los tipos sin regla propia dependen de ella.' : null}
          />
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <Paso
          titulo="Primera alerta"
          dias={estado.diasPrimeraAlerta}
          habiles={estado.primeraEnHabiles}
          puedeEditar={puedeEditar}
          onDias={(v) => setEstado((s) => ({ ...s, diasPrimeraAlerta: v }))}
          onHabiles={(v) => setEstado((s) => ({ ...s, primeraEnHabiles: v }))}
        />
        <Paso
          titulo="Última alerta"
          dias={estado.diasUltimaAlerta}
          habiles={estado.ultimaEnHabiles}
          puedeEditar={puedeEditar}
          onDias={(v) => setEstado((s) => ({ ...s, diasUltimaAlerta: v }))}
          onHabiles={(v) => setEstado((s) => ({ ...s, ultimaEnHabiles: v }))}
        />
        {puedeEditar && (
          <div className="flex justify-end">
            <Button size="sm" onClick={guardar} disabled={guardando}>
              {guardando ? <Spinner /> : <Save className="size-4" />} Guardar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function DialogNuevaRegla({ disponibles, onClose }: { disponibles: OrigenAlerta[]; onClose: () => void }) {
  const router = useRouter()
  const [clave, setClave] = useState<OrigenAlerta | ''>('')
  const [primera, setPrimera] = useState(30)
  const [primeraHabiles, setPrimeraHabiles] = useState(false)
  const [ultima, setUltima] = useState(10)
  const [ultimaHabiles, setUltimaHabiles] = useState(false)
  const [g, setG] = useState(false)

  async function guardar() {
    if (!clave) { toast.error('Elige el tipo de vencimiento.'); return }
    if (ultima > primera) { toast.error('La última alerta debe tener menos días de anticipación que la primera.'); return }
    setG(true)
    const res = await crearReglaAlerta({
      clave,
      diasPrimeraAlerta: primera, primeraEnHabiles: primeraHabiles,
      diasUltimaAlerta: ultima, ultimaEnHabiles: ultimaHabiles,
    })
    setG(false)
    if (res.ok) {
      const n = (res.datos as { reprogramados: number } | undefined)?.reprogramados ?? 0
      toast.success(n > 0 ? `Regla creada. Se reprogramaron ${n} vencimiento(s) ya registrados.` : 'Regla creada.')
      onClose(); router.refresh()
    }
    else toast.error(res.error)
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !g) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            Regla para un tipo
            <Ayuda texto="Mientras un tipo no tenga regla propia usa la global. Al crearle la suya, ese tipo empieza a avisar con los días que definas aquí." />
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Tipo de vencimiento</Label>
            <Select value={clave} onValueChange={(v) => setClave(v as OrigenAlerta)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Elige el tipo…" /></SelectTrigger>
              <SelectContent>
                {disponibles.map((o) => <SelectItem key={o} value={o}>{ETIQUETA_ORIGEN[o]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Paso titulo="Primera alerta" dias={primera} habiles={primeraHabiles} puedeEditar
            onDias={setPrimera} onHabiles={setPrimeraHabiles} />
          <Paso titulo="Última alerta" dias={ultima} habiles={ultimaHabiles} puedeEditar
            onDias={setUltima} onHabiles={setUltimaHabiles} />
        </div>
        <DialogFooter>
          <Button variant="ghost" disabled={g} onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={g}>{g && <Spinner />} Crear regla</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Paso({
  titulo, dias, habiles, puedeEditar, onDias, onHabiles,
}: {
  titulo: string; dias: number; habiles: boolean; puedeEditar: boolean
  onDias: (v: number) => void; onHabiles: (v: boolean) => void
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
      <div className="space-y-1.5">
        <Label>{titulo}</Label>
        <div className="flex items-center gap-2">
          <Input
            type="number" min={0} max={365} disabled={!puedeEditar}
            value={dias} onChange={(e) => onDias(Number(e.target.value))} className="w-20"
          />
          <span className="text-sm text-muted-foreground">días antes</span>
        </div>
      </div>
      <label className="flex items-center gap-2 pb-2 text-sm">
        <Switch checked={habiles} onCheckedChange={onHabiles} disabled={!puedeEditar} />
        Días hábiles
        <Ayuda texto="Activado cuenta solo días laborales; desactivado cuenta días calendario, que es lo que usan los plazos legales como el preaviso de 30 días." />
      </label>
    </div>
  )
}
