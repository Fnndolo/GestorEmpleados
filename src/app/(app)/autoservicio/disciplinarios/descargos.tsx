'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { presentarDescargos, apelarDecisionDisciplinario } from '@/app/(app)/juridica/acciones'
import { ZonaArchivos, subirArchivoEntidad } from '@/app/(app)/juridica/_ui'

export function Descargos({ procesoId }: { procesoId: string }) {
  const router = useRouter()
  const [texto, setTexto] = useState('')
  const [archivos, setArchivos] = useState<File[]>([])
  const [g, setG] = useState(false)

  async function enviar() {
    if (texto.trim().length < 5) { toast.error('Escribe tus descargos.'); return }
    setG(true)
    try {
      const res = await presentarDescargos({ procesoId, texto })
      if (!res.ok) throw new Error(res.error)
      const etapaId = (res.datos as { etapaId: string }).etapaId
      for (const file of archivos) await subirArchivoEntidad('EtapaProceso', etapaId, file, file.name)
      toast.success('Descargos presentados. El área encargada fue notificada.'); router.refresh()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo enviar.') } finally { setG(false) }
  }

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <p className="text-sm font-medium">Presentar mis descargos</p>
      <Textarea rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escribe aquí tu versión de los hechos y tus argumentos de defensa…" />
      <ZonaArchivos archivos={archivos} onChange={setArchivos} accept="image/*,application/pdf,video/*" />
      <div className="flex justify-end">
        <Button size="sm" onClick={enviar} disabled={g}>{g ? <Spinner /> : <Send className="size-4" />} Enviar descargos</Button>
      </div>
    </div>
  )
}

export function Apelacion({ procesoId }: { procesoId: string }) {
  const router = useRouter()
  const [texto, setTexto] = useState('')
  const [archivos, setArchivos] = useState<File[]>([])
  const [g, setG] = useState(false)

  async function enviar() {
    if (texto.trim().length < 5) { toast.error('Escribe tu recurso de apelación.'); return }
    setG(true)
    try {
      const res = await apelarDecisionDisciplinario({ procesoId, texto })
      if (!res.ok) throw new Error(res.error)
      const etapaId = (res.datos as { etapaId: string }).etapaId
      for (const file of archivos) await subirArchivoEntidad('EtapaProceso', etapaId, file, file.name)
      toast.success('Recurso de apelación enviado.'); router.refresh()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo enviar.') } finally { setG(false) }
  }

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <p className="text-sm font-medium">Apelar la decisión</p>
      <Textarea rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Explica por qué no estás de acuerdo con la decisión…" />
      <ZonaArchivos archivos={archivos} onChange={setArchivos} accept="image/*,application/pdf,video/*" />
      <div className="flex justify-end">
        <Button size="sm" onClick={enviar} disabled={g}>{g ? <Spinner /> : <Send className="size-4" />} Enviar apelación</Button>
      </div>
    </div>
  )
}
