'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { DownloadCloud } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { importarHorariosAsistencia } from '@/app/(app)/horarios/acciones'

/** Trae de AsistencIA el horario de UNA persona (por su cédula), sin tocar las plantillas. */
export function TraerDeAsistencia({ colaboradorId }: { colaboradorId: string }) {
  const router = useRouter()
  const [g, setG] = useState(false)
  async function traer() {
    setG(true)
    const res = await importarHorariosAsistencia({ colaboradorId })
    setG(false)
    if (!res.ok) { toast.error(res.error); return }
    const r = res.datos
    if (r.personasActualizadas) toast.success('Horario traído de AsistencIA: rige desde hoy.')
    else if (r.personasIguales) toast.info('Ya tiene aquí el mismo horario que en AsistencIA.')
    else if (r.sinDias.length) toast.warning('En AsistencIA tiene solo una franja general, sin horario por días: asígnaselo aquí.')
    else if (r.ops) toast.warning('Es contratista OPS: no lleva horario.')
    else toast.info('Tiene un cambio programado aquí, que manda sobre el de AsistencIA.')
    router.refresh()
  }
  return (
    <Button size="sm" variant="outline" onClick={traer} disabled={g} title="Traer su horario de AsistencIA">
      {g ? <Spinner /> : <DownloadCloud className="size-4" />} Traer de AsistencIA
    </Button>
  )
}
