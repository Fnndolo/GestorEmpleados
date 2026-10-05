'use client'

import { useId, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, Undo2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Pill, enfocarDialogo } from '@/components/ui-kit'
import { Ayuda } from '@/components/ui-kit/ayuda'
import { BotonAgregar } from '@/components/ui-kit/boton-agregar'
import { Encabezado } from '@/components/shell/encabezado'
import type { Festivo } from '@/lib/dias-habiles'
import { cn } from '@/lib/utils'
import { corregirFestivo, deshacerCorreccionFestivo } from './acciones'

type Fila = Festivo & { correccionId: string | null }

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
function dia(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`)
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`
}

/** La lista del año y las correcciones: agregar un festivo, quitar uno o deshacer. */
export function FestivosCliente({ anio, hoy, festivos, puedeEditar }: { anio: number; hoy: string; festivos: Fila[]; puedeEditar: boolean }) {
  const router = useRouter()
  const [dialogo, setDialogo] = useState<{ tipo: 'ADD' } | { tipo: 'REMOVE'; festivo: Fila } | null>(null)

  async function deshacer(f: Fila) {
    const res = await deshacerCorreccionFestivo({ id: f.correccionId! })
    if (res.ok) { toast.success('Corrección deshecha: el día vuelve al calendario de ley.'); router.refresh() } else toast.error(res.error)
  }

  return (
    <div>
      <Encabezado
        enLinea
        titulo="Festivos"
        ayuda="Se calculan solos con la ley colombiana (Ley 51 de 1983 y las que crean festivos nuevos). Corrige aquí solo si una ley o la Corte cambian alguno: afecta recargos, días hábiles, plazos de Jurídica y turnos dominicales."
        acciones={(
          <>
            <span className="hidden text-sm text-muted-foreground sm:inline">{festivos.filter((f) => f.origen !== 'quitado').length} festivos</span>
            <div className="flex items-center rounded-lg border">
              <Link href={`?anio=${anio - 1}`} className="grid size-8 place-items-center rounded-l-lg hover:bg-accent" aria-label="Año anterior" title="Año anterior"><ChevronLeft className="size-4" /></Link>
              <span className="min-w-12 text-center text-sm font-medium tabular-nums">{anio}</span>
              <Link href={`?anio=${anio + 1}`} className="grid size-8 place-items-center rounded-r-lg hover:bg-accent" aria-label="Año siguiente" title="Año siguiente"><ChevronRight className="size-4" /></Link>
            </div>
            {puedeEditar && <BotonAgregar etiqueta="Agregar un festivo" onClick={() => setDialogo({ tipo: 'ADD' })} />}
          </>
        )}
      />

      <Card className="py-0"><CardContent className="divide-y p-0">
        {festivos.map((f) => (
          <div key={f.fecha} className={cn('flex items-center gap-3 px-3 py-2.5 text-sm', f.fecha < hoy && 'text-muted-foreground')}>
            <span className={cn('w-[4.75rem] shrink-0 tabular-nums sm:w-24', f.origen === 'quitado' && 'line-through')}>{dia(f.fecha)}</span>
            {/* El nombre puede ocupar dos renglones en el celular; la ley y las
                correcciones van debajo (al lado en pantallas anchas). */}
            <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-2">
              <p className={cn('min-w-0', f.origen === 'quitado' && 'line-through')}>{f.nombre}</p>
              {(f.ley || f.origen !== 'calendario') && (
                <div className="mt-1 flex flex-wrap gap-1 sm:mt-0">
                  {f.ley && <Pill tone="info">{f.ley}</Pill>}
                  {f.origen === 'agregado' && <Pill tone="accent">Agregado aquí</Pill>}
                  {f.origen === 'quitado' && <Pill tone="muted">Quitado aquí</Pill>}
                </div>
              )}
            </div>
            {puedeEditar && (f.correccionId ? (
              <Button size="sm" variant="ghost" className="max-sm:size-8 max-sm:px-0" onClick={() => deshacer(f)} aria-label={`Deshacer la corrección de ${f.nombre}`} title="Deshacer la corrección">
                <Undo2 className="size-4" /> <span className="max-sm:sr-only">Deshacer</span>
              </Button>
            ) : (
              <Button size="icon" variant="ghost" onClick={() => setDialogo({ tipo: 'REMOVE', festivo: f })} aria-label={`Quitar ${f.nombre}`} title="Quitar este festivo"><X className="size-4" /></Button>
            ))}
          </div>
        ))}
      </CardContent></Card>

      {dialogo && (
        <DialogoCorreccion
          anio={anio}
          inicial={dialogo}
          onClose={() => setDialogo(null)}
          onDone={() => { setDialogo(null); router.refresh() }}
        />
      )}
    </div>
  )
}

function DialogoCorreccion({ anio, inicial, onClose, onDone }: {
  anio: number
  inicial: { tipo: 'ADD' } | { tipo: 'REMOVE'; festivo: Fila }
  onClose: () => void
  onDone: () => void
}) {
  const uid = useId()
  const quitar = inicial.tipo === 'REMOVE'
  const [fecha, setFecha] = useState(quitar ? inicial.festivo.fecha : '')
  const [nombre, setNombre] = useState('')
  const [g, setG] = useState(false)

  async function guardar() {
    setG(true)
    const res = await corregirFestivo({ fecha, tipo: inicial.tipo, nombre })
    setG(false)
    if (!res.ok) { toast.error(res.error); return }
    toast.success(quitar ? 'Festivo quitado.' : 'Festivo agregado.')
    onDone()
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !g) onClose() }}>
      {/* Al abrir, el foco no va al ⓘ: abriría su globo y se quedaría con el Escape. */}
      <DialogContent className="sm:max-w-md" onOpenAutoFocus={enfocarDialogo}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            {quitar ? `Quitar ${inicial.festivo.nombre}` : 'Agregar un festivo'}
            <Ayuda
              etiqueta="Cuándo corregir un festivo"
              texto={quitar
                ? 'Hazlo solo si una ley o la Corte lo eliminaron: ese día pasa a ser hábil y sin recargo festivo.'
                : 'Solo para un festivo nacional que la plataforma no tenga (ley o decreto nuevo). Un descanso propio de la empresa no va aquí: llevaría recargo festivo y correría los plazos legales.'}
            />
          </DialogTitle>
          <DialogDescription>
            {quitar ? `El ${dia(inicial.festivo.fecha)} quedará como día hábil.` : 'Solo festivos nacionales (ley o decreto).'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {!quitar && (
            <div className="space-y-1.5">
              <Label htmlFor={`fecha-${uid}`}>Fecha <span className="text-destructive">*</span></Label>
              <Input id={`fecha-${uid}`} type="date" min={`${anio - 1}-01-01`} value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor={`nombre-${uid}`}>{quitar ? 'Norma o decisión que lo elimina' : 'Nombre y norma que lo crea'} <span className="text-destructive">*</span></Label>
            <Input id={`nombre-${uid}`} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={quitar ? 'Sentencia C-000 de 2026' : 'Día de… (Ley 0000 de 2027)'} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={g}>Cancelar</Button>
          <Button variant={quitar ? 'destructive' : 'default'} onClick={guardar} disabled={g || !fecha || nombre.trim().length < 3}>
            {g && <Spinner />} {quitar ? 'Quitar festivo' : 'Agregar festivo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
