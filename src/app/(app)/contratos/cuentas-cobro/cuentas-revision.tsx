'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { CheckCircle2, XCircle, Download, ShieldAlert, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { fmtCOP } from '@/lib/moneda'
import { formatFechaCorta } from '@/lib/fechas'
import { cambiarEstadoCuenta } from '../ops-acciones'

type Cuenta = {
  id: string; numero: string; periodo: string; concepto: string | null; valor: number
  estado: string; fechaRadicacion: string; documentoId: string | null
  colaborador: string; esOps: boolean; contratoOpsId: string | null; ssValida: boolean
}

const ESTADO: Record<string, string> = {
  RADICADA: 'Radicada', EN_VERIFICACION_SS: 'En verificación', BLOQUEADA_SS: 'Bloqueada (SS)',
  APROBADA: 'Aprobada', PAGADA: 'Pagada', RECHAZADA: 'Rechazada',
}

export function CuentasRevision({ puedeAprobar, cuentas }: { puedeAprobar: boolean; cuentas: Cuenta[] }) {
  const router = useRouter()
  const [proc, setProc] = useState<string | null>(null)

  async function cambiar(id: string, estado: string, conFecha = false) {
    setProc(id)
    const res = await cambiarEstadoCuenta({ id, estado: estado as 'APROBADA', fechaPago: conFecha ? new Date().toISOString().slice(0, 10) : undefined })
    setProc(null)
    if (res.ok) { toast.success('Cuenta actualizada.'); router.refresh() } else toast.error(res.error)
  }

  return (
    <div className="space-y-3">
      {cuentas.map((c) => (
        <Card key={c.id}>
          <CardContent className="py-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{c.colaborador} · {c.numero}</p>
                <p className="text-xs text-muted-foreground">Periodo {c.periodo} · {c.concepto ?? 'Sin concepto'} · radicada {formatFechaCorta(new Date(c.fechaRadicacion))}</p>
              </div>
              <span className="text-sm font-medium hidden sm:block">{fmtCOP(c.valor)}</span>
              {c.documentoId && (
                <Button variant="ghost" size="icon" asChild aria-label="PDF"><a href={`/api/documentos/${c.documentoId}`} target="_blank" rel="noreferrer"><Download className="size-4" /></a></Button>
              )}
              <Badge variant={c.estado === 'PAGADA' || c.estado === 'APROBADA' ? 'default' : c.estado === 'RECHAZADA' || c.estado === 'BLOQUEADA_SS' ? 'destructive' : 'secondary'}>{ESTADO[c.estado]}</Badge>
            </div>

            {c.esOps && !c.ssValida && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-700">
                <ShieldAlert className="size-4 shrink-0" />
                <span className="flex-1">Contratista OPS: requiere verificar el soporte de seguridad social antes de aprobar/pagar.</span>
                {c.contratoOpsId && (
                  <Button size="sm" variant="outline" asChild><Link href={`/contratos/ops/${c.contratoOpsId}`}><ExternalLink className="size-3.5" /> Gestionar</Link></Button>
                )}
              </div>
            )}

            {puedeAprobar && c.estado !== 'PAGADA' && c.estado !== 'RECHAZADA' && (
              <div className="flex flex-wrap justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => cambiar(c.id, 'RECHAZADA')} disabled={proc === c.id}><XCircle className="size-4" /> Rechazar</Button>
                <Button size="sm" variant="outline" onClick={() => cambiar(c.id, 'APROBADA')} disabled={proc === c.id}>{proc === c.id ? <Spinner /> : <CheckCircle2 className="size-4" />} Aprobar</Button>
                <Button size="sm" onClick={() => cambiar(c.id, 'PAGADA', true)} disabled={proc === c.id}><CheckCircle2 className="size-4" /> Marcar pagada</Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
