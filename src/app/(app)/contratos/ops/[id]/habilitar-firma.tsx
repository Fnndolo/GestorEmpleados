'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PenLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { SelectorFirmasPdf, type Posicion } from '../nuevo/selector-firmas-pdf'
import { prepararFirmaContratoOps, habilitarFirmaContratoOps } from '../../ops-acciones'

/**
 * Pasa al flujo de firma un contrato que se cargó como «ya firmado en físico».
 *
 * Es la reparación de un error de pantalla: quien sube el contrato por la ficha
 * del colaborador (pensada para papeles ya firmados) deja al contratista viendo
 * el PDF en su autoservicio pero sin botón para firmarlo, y hasta ahora no había
 * forma de arreglarlo ni de borrar el contrato para rehacerlo.
 *
 * El PDF no se vuelve a subir: se lee el que ya está guardado y solo falta
 * confirmar dónde firma cada parte, igual que en el alta.
 */

/** Posición de arranque cuando el PDF es un escaneo y no hay nada que proponer. */
const POR_DEFECTO: Omit<Posicion, 'pagina'> = { x: 80, y: 150, ancho: 150, alto: 45 }

type Preparado = {
  nombre: string
  paginas: number
  pdfBase64: string
  contratista: Posicion | null
  contratante: Posicion | null
}

export function HabilitarFirma({ contratoId }: { contratoId: string }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [guardando, empezar] = useTransition()
  const [datos, setDatos] = useState<Preparado | null>(null)
  const [detectado, setDetectado] = useState<{ contratista: boolean; contratante: boolean } | null>(null)
  const [posiciones, setPosiciones] = useState<Record<'contratista' | 'contratante', Posicion>>({
    contratista: { ...POR_DEFECTO, pagina: 1 },
    contratante: { ...POR_DEFECTO, pagina: 1 },
  })

  async function abrir() {
    setCargando(true)
    const res = await prepararFirmaContratoOps({ contratoId })
    setCargando(false)
    if (!res.ok) { toast.error(res.error); return }
    const d = res.datos as Preparado
    setDatos(d)
    setDetectado({ contratista: !!d.contratista, contratante: !!d.contratante })
    // Sin detección se cae a la ÚLTIMA página: es donde va el bloque de firmas.
    setPosiciones({
      contratista: d.contratista ?? { ...POR_DEFECTO, pagina: d.paginas, x: 330 },
      contratante: d.contratante ?? { ...POR_DEFECTO, pagina: d.paginas },
    })
    setAbierto(true)
  }

  function guardar() {
    empezar(async () => {
      const res = await habilitarFirmaContratoOps({
        contratoId,
        posicionContratista: posiciones.contratista,
        posicionContratante: posiciones.contratante,
      })
      if (!res.ok) { toast.error(res.error); return }
      toast.success('Listo. El contratista ya puede firmarlo desde su autoservicio y le llegó el aviso.')
      setAbierto(false)
      router.refresh()
    })
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={abrir} disabled={cargando}>
        {cargando ? <Spinner /> : <PenLine className="size-4" />} Habilitar firma en la app
      </Button>

      {abierto && datos && (
        <Dialog open onOpenChange={(o) => !o && setAbierto(false)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Habilitar la firma en la app</DialogTitle>
              <DialogDescription>
                Arrastra el recuadro de cada parte hasta donde debe ir su firma dentro de{' '}
                {datos.nombre}. El documento no se modifica ahora: las firmas se estampan
                cuando cada parte firme.
              </DialogDescription>
            </DialogHeader>

            {detectado && !detectado.contratista && !detectado.contratante && (
              <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                No se pudo proponer la posición: el PDF parece un escaneo, sin capa de texto.
                Ubica los dos recuadros a mano sobre el documento.
              </p>
            )}

            <SelectorFirmasPdf
              pdfDataUri={datos.pdfBase64}
              paginas={datos.paginas}
              valor={posiciones}
              onChange={setPosiciones}
            />

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
              <Button onClick={guardar} disabled={guardando}>
                {guardando && <Spinner />} Habilitar firma y avisar al contratista
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
