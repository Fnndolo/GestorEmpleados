'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { DownloadCloud } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { importarHorariosAsistencia } from './acciones'

type Resumen = {
  plantillasNuevas: number; plantillasActualizadas: number; personasActualizadas: number; personasIguales: number
  sinFicha: string[]; sinDias: string[]; ops: number
}

/**
 * Trae de AsistencIA las plantillas de horario y el de cada persona. Es
 * opcional: se usa para arrancar con lo que ya está allá, o para alinear si
 * alguien cambió un horario allá directamente. Pide confirmación porque lo
 * distinto se registra como un cambio desde hoy.
 */
export function ImportarAsistencia() {
  const router = useRouter()
  const [confirmar, setConfirmar] = useState(false)
  const [g, setG] = useState(false)
  const [resumen, setResumen] = useState<Resumen | null>(null)

  async function importar() {
    setG(true)
    const res = await importarHorariosAsistencia({})
    setG(false)
    setConfirmar(false)
    if (!res.ok) { toast.error(res.error); return }
    setResumen(res.datos)
    router.refresh()
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setConfirmar(true)} aria-label="Recuperar de AsistencIA" title="Recuperar de AsistencIA" className="max-sm:size-8 max-sm:px-0">
        <DownloadCloud className="size-4" /> <span className="max-sm:sr-only">Recuperar de AsistencIA</span>
      </Button>

      <Dialog open={confirmar} onOpenChange={(o) => { if (!g) setConfirmar(o) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recuperar de AsistencIA</DialogTitle>
            <DialogDescription>
              Trae los horarios que hay en AsistencIA y el de cada persona (por cédula). A quien allá tenga un horario distinto al de aquí se le registra el de allá desde hoy. No se envían comunicaciones.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmar(false)} disabled={g}>Cancelar</Button>
            <Button onClick={importar} disabled={g}>{g && <Spinner />} Recuperar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resumen !== null} onOpenChange={(o) => { if (!o) setResumen(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Listo</DialogTitle>
            <DialogDescription>Esto se trajo de AsistencIA.</DialogDescription>
          </DialogHeader>
          {resumen && (
            <ul className="space-y-1.5 text-sm">
              <li><b>{resumen.personasActualizadas}</b> persona{resumen.personasActualizadas === 1 ? '' : 's'} con horario actualizado · <b>{resumen.personasIguales}</b> ya estaba{resumen.personasIguales === 1 ? '' : 'n'} igual</li>
              <li><b>{resumen.plantillasNuevas}</b> horario{resumen.plantillasNuevas === 1 ? '' : 's'} nuevo{resumen.plantillasNuevas === 1 ? '' : 's'} · <b>{resumen.plantillasActualizadas}</b> actualizado{resumen.plantillasActualizadas === 1 ? '' : 's'}</li>
              {resumen.sinDias.length > 0 && (
                <li className="text-amber-700 dark:text-amber-400">
                  {resumen.sinDias.length} sin horario por días en AsistencIA (solo tienen entrada y salida generales): {resumen.sinDias.join(', ')}. Asígnaselo aquí.
                </li>
              )}
              {resumen.sinFicha.length > 0 && (
                <li className="text-muted-foreground">{resumen.sinFicha.length} en AsistencIA sin ficha activa aquí con esa cédula: {resumen.sinFicha.join(', ')}.</li>
              )}
              {resumen.ops > 0 && <li className="text-muted-foreground">{resumen.ops} contratista{resumen.ops === 1 ? '' : 's'} OPS: aquí no llevan horario.</li>}
            </ul>
          )}
          <DialogFooter><Button onClick={() => setResumen(null)}>Entendido</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
