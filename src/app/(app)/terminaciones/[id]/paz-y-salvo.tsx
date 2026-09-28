'use client'

import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { UserRound } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { verificarItemPazSalvo } from '../acciones'
import { DocumentoFirma, type EstadoDocumento } from './documento-firma'

type Item = { id: string; area: string; concepto: string; cumplido: boolean; observacion: string | null; responsable: string | null; verificadoPor: string | null }

/** Paso "Paz y salvo": las áreas verifican la entrega y, con todo listo, el acta se firma y se envía. */
export function PazYSalvoChecklist({ items, acta, terminacionId, cerrada, puedeEditar }: {
  items: Item[]; acta: EstadoDocumento; terminacionId: string; cerrada: boolean; puedeEditar: boolean
}) {
  const router = useRouter()
  const completo = items.every((i) => i.cumplido)
  // Enviada a firmar: el checklist queda congelado (es lo que el trabajador firma).
  const congelado = cerrada || !!acta.enviadaEn

  async function toggle(itemId: string, cumplido: boolean) {
    const res = await verificarItemPazSalvo({ itemId, cumplido })
    if (res.ok) router.refresh()
    else toast.error(res.error)
  }

  return (
    <div className="space-y-3">
      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map((i) => (
          <li key={i.id}>
            <label className="flex h-full cursor-pointer items-start gap-3 rounded-lg border p-3 has-[:disabled]:cursor-default">
              <Checkbox checked={i.cumplido} disabled={!puedeEditar || congelado} onCheckedChange={(v) => toggle(i.id, Boolean(v))} className="mt-0.5" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{i.area}</span>
                <span className="block text-xs text-muted-foreground">{i.concepto}</span>
                {i.observacion && !i.cumplido && <span className="mt-0.5 block text-xs font-medium text-amber-700 dark:text-amber-400">{i.observacion}</span>}
                <span className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <UserRound className="size-3 shrink-0" />
                  <span className="truncate">{i.cumplido && i.verificadoPor ? `Verificó ${i.verificadoPor}` : i.responsable ?? 'Talento Humano'}</span>
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <DocumentoFirma
        terminacionId={terminacionId}
        tipo="PAZ_Y_SALVO"
        titulo="Acta de paz y salvo"
        estado={acta}
        listo={completo}
        faltante="Faltan áreas"
        puedeEditar={puedeEditar}
        cerrada={cerrada}
      />
    </div>
  )
}
