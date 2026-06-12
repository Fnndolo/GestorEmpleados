'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Save } from 'lucide-react'
import { guardarReglaAlerta } from './acciones'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type Regla = {
  id: string; clave: string; descripcion: string
  diasPrimeraAlerta: number; primeraEnHabiles: boolean
  diasUltimaAlerta: number; ultimaEnHabiles: boolean
}

export function ReglasAlertaCliente({ reglas, puedeEditar }: { reglas: Regla[]; puedeEditar: boolean }) {
  return (
    <div className="space-y-4">
      {reglas.map((r) => <TarjetaRegla key={r.id} regla={r} puedeEditar={puedeEditar} />)}
    </div>
  )
}

function TarjetaRegla({ regla, puedeEditar }: { regla: Regla; puedeEditar: boolean }) {
  const router = useRouter()
  const [estado, setEstado] = useState(regla)
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    setGuardando(true)
    const res = await guardarReglaAlerta({
      id: regla.id,
      diasPrimeraAlerta: estado.diasPrimeraAlerta,
      primeraEnHabiles: estado.primeraEnHabiles,
      diasUltimaAlerta: estado.diasUltimaAlerta,
      ultimaEnHabiles: estado.ultimaEnHabiles,
    })
    setGuardando(false)
    if (res.ok) { toast.success('Regla guardada.'); router.refresh() }
    else toast.error(res.error)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{regla.clave === 'GLOBAL' ? 'Regla global (por defecto)' : regla.clave}</CardTitle>
        <p className="text-xs text-muted-foreground">{regla.descripcion}</p>
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
            type="number" min={0} max={120} disabled={!puedeEditar}
            value={dias} onChange={(e) => onDias(Number(e.target.value))} className="w-20"
          />
          <span className="text-sm text-muted-foreground">días antes</span>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm pb-2">
        <Switch checked={habiles} onCheckedChange={onHabiles} disabled={!puedeEditar} />
        Días hábiles
      </label>
    </div>
  )
}
