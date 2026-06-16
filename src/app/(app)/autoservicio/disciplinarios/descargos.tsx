'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { presentarDescargos } from '@/app/(app)/juridica/acciones'

export function Descargos({ procesoId }: { procesoId: string }) {
  const router = useRouter()
  const [texto, setTexto] = useState('')
  const [g, setG] = useState(false)

  async function enviar() {
    if (texto.trim().length < 5) { toast.error('Escribe tus descargos.'); return }
    setG(true)
    const res = await presentarDescargos({ procesoId, texto })
    setG(false)
    if (res.ok) { toast.success('Descargos presentados. El área encargada fue notificada.'); router.refresh() }
    else toast.error(res.error)
  }

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <p className="text-sm font-medium">Presentar mis descargos</p>
      <Textarea rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escribe aquí tu versión de los hechos y tus argumentos de defensa…" />
      <div className="flex justify-end">
        <Button size="sm" onClick={enviar} disabled={g}>{g ? <Spinner /> : <Send className="size-4" />} Enviar descargos</Button>
      </div>
    </div>
  )
}
