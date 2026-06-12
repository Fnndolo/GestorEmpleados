'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { avanzarEtapaDisciplinario } from '../../acciones'

const ETAPAS = [
  { v: 'CITACION_DESCARGOS', l: 'Citación a descargos' },
  { v: 'DESCARGOS', l: 'Descargos' },
  { v: 'DECISION', l: 'Decisión' },
  { v: 'RECURSO', l: 'Recurso' },
  { v: 'CERRADO', l: 'Cerrar proceso' },
]

export function EtapasDisciplinario({ procesoId, etapaActual }: { procesoId: string; etapaActual: string }) {
  const router = useRouter()
  const [etapa, setEtapa] = useState('DESCARGOS')
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [detalle, setDetalle] = useState('')
  const [g, setG] = useState(false)

  async function registrar() {
    setG(true)
    const res = await avanzarEtapaDisciplinario({ procesoId, etapa: etapa as 'DESCARGOS', fecha, detalle })
    setG(false)
    if (res.ok) { toast.success('Actuación registrada.'); setDetalle(''); router.refresh() } else toast.error(res.error)
  }

  return (
    <Card><CardContent className="py-4 space-y-3">
      <h3 className="text-sm font-medium">Registrar actuación (debido proceso)</h3>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Etapa</Label>
          <Select value={etapa} onValueChange={setEtapa}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{ETAPAS.map((e) => <SelectItem key={e.v} value={e.v}>{e.l}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Fecha</Label><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
      </div>
      <div className="space-y-1.5"><Label>Detalle</Label><Textarea rows={2} value={detalle} onChange={(e) => setDetalle(e.target.value)} /></div>
      <div className="flex justify-end">
        <Button size="sm" onClick={registrar} disabled={g}>{g ? <Spinner /> : <ArrowRight className="size-4" />} Registrar</Button>
      </div>
    </CardContent></Card>
  )
}
