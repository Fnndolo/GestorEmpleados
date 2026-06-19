'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { actualizarParametroNomina } from './acciones'

const fmtCOP = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)

export function ParametrosForm({ puedeEditar, smmlv, auxTransporte, fuenteSmmlv, fuenteAux }: {
  puedeEditar: boolean; smmlv: number; auxTransporte: number; fuenteSmmlv: string; fuenteAux: string
}) {
  const router = useRouter()
  const [valSmmlv, setValSmmlv] = useState(String(smmlv))
  const [valAux, setValAux] = useState(String(auxTransporte))
  const [g, setG] = useState<string | null>(null)

  async function guardar(clave: 'SMMLV' | 'AUX_TRANSPORTE', valor: string) {
    setG(clave)
    const res = await actualizarParametroNomina({ clave, valor: Number(valor) })
    setG(null)
    if (res.ok) { toast.success('Parámetro actualizado.'); router.refresh() }
    else toast.error(res.error)
  }

  return (
    <div className="space-y-4">
      <Card><CardContent className="py-6 space-y-2">
        <Label>Salario mínimo (SMMLV) {fuenteSmmlv && <span className="text-xs text-muted-foreground">· {fuenteSmmlv}</span>}</Label>
        <div className="flex gap-2">
          <Input type="number" step="1" value={valSmmlv} onChange={(e) => setValSmmlv(e.target.value)} disabled={!puedeEditar} />
          {puedeEditar && <Button onClick={() => guardar('SMMLV', valSmmlv)} disabled={g === 'SMMLV'}>{g === 'SMMLV' ? <Spinner /> : <Save className="size-4" />} Guardar</Button>}
        </div>
        <p className="text-xs text-muted-foreground">Actual: {fmtCOP(smmlv)}. Los contratos marcados como “gana salario mínimo” usan este valor.</p>
      </CardContent></Card>

      <Card><CardContent className="py-6 space-y-2">
        <Label>Auxilio de transporte {fuenteAux && <span className="text-xs text-muted-foreground">· {fuenteAux}</span>}</Label>
        <div className="flex gap-2">
          <Input type="number" step="1" value={valAux} onChange={(e) => setValAux(e.target.value)} disabled={!puedeEditar} />
          {puedeEditar && <Button onClick={() => guardar('AUX_TRANSPORTE', valAux)} disabled={g === 'AUX_TRANSPORTE'}>{g === 'AUX_TRANSPORTE' ? <Spinner /> : <Save className="size-4" />} Guardar</Button>}
        </div>
        <p className="text-xs text-muted-foreground">Actual: {fmtCOP(auxTransporte)}/mes. Se paga a quienes ganan ≤2 SMMLV y tienen el auxilio activo en su contrato.</p>
      </CardContent></Card>
    </div>
  )
}
