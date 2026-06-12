'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { resolverPaso } from '../acciones'

type Solicitud = { id: string; pasoId: string; tipo: string; colaborador: string; sede: string; creadoEn: string; detalle: string }
const TIPO: Record<string, string> = { VACACIONES: 'Vacaciones', PERMISO: 'Permiso', CERTIFICACION_LABORAL: 'Certificación', LICENCIA: 'Licencia' }

export function BandejaAprobaciones({ solicitudes }: { solicitudes: Solicitud[] }) {
  const router = useRouter()
  const [procesando, setProcesando] = useState<string | null>(null)

  async function resolver(pasoId: string, aprobar: boolean) {
    setProcesando(pasoId)
    const res = await resolverPaso({ pasoId, aprobar })
    setProcesando(null)
    if (res.ok) { toast.success(aprobar ? 'Aprobada.' : 'Rechazada.'); router.refresh() }
    else toast.error(res.error)
  }

  return (
    <div className="space-y-3">
      {solicitudes.map((s) => (
        <Card key={s.id}>
          <CardContent className="py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{s.colaborador}</p>
                  <Badge variant="outline">{TIPO[s.tipo]}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{s.detalle}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.sede} · {s.creadoEn}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <Button size="sm" variant="outline" onClick={() => resolver(s.pasoId, false)} disabled={procesando === s.pasoId}>
                <X className="size-4" /> Rechazar
              </Button>
              <Button size="sm" onClick={() => resolver(s.pasoId, true)} disabled={procesando === s.pasoId}>
                {procesando === s.pasoId ? <Spinner /> : <Check className="size-4" />} Aprobar
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
