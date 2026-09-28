'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, Lock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { AvatarColaborador, Pill } from '@/components/ui-kit'
import { verificarEntrega } from '../retiro-acciones'

export type EntregaItem = {
  id: string
  area: string
  concepto: string
  alerta: string | null
  cumplido: boolean
  /** El acta ya se envió a firmar: no se puede cambiar. */
  bloqueado: boolean
  colaborador: string
  fotoUrl: string | null
  retiro: string
  verificadoEn: string | null
}

/** Las áreas a cargo del usuario, pendientes primero; un botón para marcar cada una. */
export function EntregasPorVerificar({ items }: { items: EntregaItem[] }) {
  const pendientes = items.filter((i) => !i.cumplido)
  const hechas = items.filter((i) => i.cumplido)
  return (
    <div className="space-y-5">
      {pendientes.length > 0 && <Grupo titulo={`Por verificar · ${pendientes.length}`} items={pendientes} />}
      {hechas.length > 0 && <Grupo titulo="Verificadas" items={hechas} />}
    </div>
  )
}

function Grupo({ titulo, items }: { titulo: string; items: EntregaItem[] }) {
  return (
    <section>
      <h2 className="mb-2 text-[13px] font-bold">{titulo}</h2>
      <Card className="py-0"><CardContent className="divide-y p-0">
        {items.map((i) => <Fila key={i.id} i={i} />)}
      </CardContent></Card>
    </section>
  )
}

function Fila({ i }: { i: EntregaItem }) {
  const router = useRouter()
  const [g, setG] = useState(false)

  async function marcar(cumplido: boolean) {
    setG(true)
    const res = await verificarEntrega({ itemId: i.id, cumplido })
    setG(false)
    if (res.ok) { toast.success(cumplido ? 'Entrega verificada.' : 'Marcada como pendiente.'); router.refresh() } else toast.error(res.error)
  }

  return (
    <div className="flex items-center gap-3 p-3">
      <AvatarColaborador nombre={i.colaborador} fotoUrl={i.fotoUrl} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{i.colaborador}</p>
        <p className="truncate text-xs text-muted-foreground">{i.area} · {i.concepto}</p>
        {i.alerta && <p className="text-xs font-medium text-amber-700 dark:text-amber-400">{i.alerta}</p>}
        <p className="text-[11px] text-muted-foreground">Retiro {i.retiro}{i.verificadoEn ? ` · verificada el ${i.verificadoEn}` : ''}</p>
      </div>
      {i.bloqueado ? (
        <Pill tone="muted"><Lock className="size-3" /> Acta enviada</Pill>
      ) : i.cumplido ? (
        <Button size="sm" variant="ghost" onClick={() => marcar(false)} disabled={g}>{g ? <Spinner /> : 'Deshacer'}</Button>
      ) : (
        <Button size="sm" onClick={() => marcar(true)} disabled={g}>{g ? <Spinner /> : <Check className="size-4" />} Verificada</Button>
      )}
    </div>
  )
}
