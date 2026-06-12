'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { RefreshCw, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { formatFechaCorta } from '@/lib/fechas'
import { completarOcurrencia, generarCalendario } from './acciones'

type Item = { id: string; nombre: string; categoria: string; fechaLimite: string; fuente: string | null; dias: number; vencida: boolean }

export function CalendarioCliente({ items, puedeEditar, puedeGenerar }: { items: Item[]; puedeEditar: boolean; puedeGenerar: boolean }) {
  const router = useRouter()
  const [generando, setGenerando] = useState(false)
  const [completando, setCompletando] = useState<string | null>(null)

  async function generar() {
    setGenerando(true)
    const res = await generarCalendario({})
    setGenerando(false)
    if (res.ok) { toast.success(`${(res.datos as { creadas: number }).creadas} ocurrencia(s) generada(s).`); router.refresh() } else toast.error(res.error)
  }

  async function completar(id: string) {
    setCompletando(id)
    const res = await completarOcurrencia({ id })
    setCompletando(null)
    if (res.ok) { toast.success('Obligación marcada como cumplida.'); router.refresh() } else toast.error(res.error)
  }

  return (
    <div className="space-y-3">
      {puedeGenerar && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={generar} disabled={generando}>
            {generando ? <Spinner /> : <RefreshCw className="size-4" />} Generar próximas fechas
          </Button>
        </div>
      )}
      {items.map((o) => (
        <Card key={o.id} className={o.vencida ? 'border-destructive/40' : ''}>
          <CardContent className="flex items-center gap-3 py-3">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{o.nombre}</p>
              <p className="text-xs text-muted-foreground">{o.categoria} · vence {formatFechaCorta(new Date(o.fechaLimite))}{o.fuente ? ` · ${o.fuente}` : ''}</p>
            </div>
            <Badge variant={o.vencida ? 'destructive' : o.dias <= 5 ? 'secondary' : 'outline'}>
              {o.vencida ? `Venció hace ${Math.abs(o.dias)} d` : o.dias === 0 ? 'Hoy' : `En ${o.dias} d`}
            </Badge>
            {puedeEditar && (
              <Button size="sm" variant="ghost" onClick={() => completar(o.id)} disabled={completando === o.id}>
                {completando === o.id ? <Spinner /> : <CheckCircle2 className="size-4" />} Cumplida
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
