'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { verificarItemPazSalvo, cerrarTerminacion } from '../acciones'

type Item = { id: string; area: string; concepto: string; cumplido: boolean; observacion: string | null }

export function PazYSalvoChecklist({
  estado, items, terminacionId, terminacionEstado, puedeEditar, puedeAprobar,
}: {
  estado: string; items: Item[]; terminacionId: string; terminacionEstado: string
  puedeEditar: boolean; puedeAprobar: boolean
}) {
  const router = useRouter()
  const [cerrando, setCerrando] = useState(false)
  const completo = items.every((i) => i.cumplido)

  async function toggle(itemId: string, cumplido: boolean) {
    const res = await verificarItemPazSalvo({ itemId, cumplido })
    if (res.ok) router.refresh()
    else toast.error(res.error)
  }

  async function cerrar() {
    setCerrando(true)
    const res = await cerrarTerminacion({ id: terminacionId })
    setCerrando(false)
    if (res.ok) { toast.success('Terminación cerrada.'); router.refresh() } else toast.error(res.error)
  }

  return (
    <Card><CardContent className="py-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium">Paz y salvo por área</h3>
        <Badge variant={estado === 'COMPLETO' ? 'default' : 'secondary'}>{estado === 'COMPLETO' ? 'Completo' : 'Pendiente'}</Badge>
      </div>
      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.id} className="flex items-start gap-3 rounded-lg border p-3">
            <Checkbox checked={i.cumplido} disabled={!puedeEditar || terminacionEstado === 'CERRADA'} onCheckedChange={(v) => toggle(i.id, Boolean(v))} className="mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium">{i.area}</p>
              <p className="text-xs text-muted-foreground">{i.concepto}</p>
            </div>
          </li>
        ))}
      </ul>
      {puedeAprobar && terminacionEstado !== 'CERRADA' && (
        <div className="flex justify-end mt-4">
          <Button size="sm" onClick={cerrar} disabled={!completo || cerrando}>
            {cerrando ? <Spinner /> : <Lock className="size-4" />} Cerrar terminación
          </Button>
        </div>
      )}
    </CardContent></Card>
  )
}
