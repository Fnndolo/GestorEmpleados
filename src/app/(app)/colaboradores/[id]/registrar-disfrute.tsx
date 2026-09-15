'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { registrarVacacionesDisfrutadas } from '@/app/(app)/novedades/acciones'

/**
 * Anotar vacaciones que ya se disfrutaron y no quedaron en el sistema: las de
 * antes de la plataforma, o las que se tomaron sin registrarlas. Descuentan del
 * saldo de inmediato. Las futuras se programan en Novedades → Vacaciones, que
 * exige el preaviso legal y avisa al trabajador; aquí no hay nada que avisar.
 */
export function RegistrarDisfrute({ colaboradorId, hoyISO }: { colaboradorId: string; hoyISO: string }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [ini, setIni] = useState('')
  const [fin, setFin] = useState('')
  const [obs, setObs] = useState('')
  const [g, setG] = useState(false)

  function cerrar() {
    setAbierto(false)
    setIni(''); setFin(''); setObs('')
  }

  async function guardar() {
    setG(true)
    const res = await registrarVacacionesDisfrutadas({ colaboradorId, fechaInicio: ini, fechaFin: fin, observaciones: obs })
    setG(false)
    if (res.ok) {
      const d = res.datos.dias
      toast.success(`Registrados ${d} día${d === 1 ? '' : 's'} hábil${d === 1 ? '' : 'es'} de vacaciones ya disfrutadas. El saldo quedó actualizado.`)
      cerrar()
      router.refresh()
    } else {
      toast.error(res.error)
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setAbierto(true)}>
        <CalendarCheck className="size-4" /> Registrar vacaciones ya tomadas
      </Button>
      <Dialog open={abierto} onOpenChange={(o) => (o ? setAbierto(true) : cerrar())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vacaciones ya disfrutadas</DialogTitle>
            <DialogDescription>
              Para vacaciones que ya se tomaron y no quedaron registradas. Se cuentan los días hábiles del
              rango y se descuentan del saldo. Las futuras se programan en Novedades → Vacaciones.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="disf-ini">Desde</Label>
                <Input id="disf-ini" type="date" max={hoyISO} value={ini} onChange={(e) => setIni(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="disf-fin">Hasta</Label>
                <Input id="disf-fin" type="date" max={hoyISO} value={fin} onChange={(e) => setFin(e.target.value)} />
              </div>
            </div>
            {ini && fin && fin < ini && <p className="text-xs text-destructive">La fecha de fin no puede ser anterior a la de inicio.</p>}
            <div className="space-y-1.5">
              <Label htmlFor="disf-obs">Observación (opcional)</Label>
              <Textarea id="disf-obs" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ej.: tomadas en diciembre, antes de la plataforma" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={cerrar}>Cancelar</Button>
            <Button onClick={guardar} disabled={g || !ini || !fin || fin < ini}>{g && <Spinner />}Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
