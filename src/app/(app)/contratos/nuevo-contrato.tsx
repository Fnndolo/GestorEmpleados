'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { enfocarDialogo } from '@/components/ui-kit'
import { GENERAR_CONTRATOS_DESDE_PLANTILLA } from '@/lib/contratos-config'
import { ModoNuevoOps } from './ops/nuevo/modo-nuevo-ops'
import { FormContrato } from './form-contrato'
import { ContratoLaboralSubido } from './form-laboral-subido'

export type ClaseNuevo = 'ops' | 'laboral'

/**
 * Ancho de las ventanas. Con plantillas activas los formularios llevan la vista
 * previa al lado y piden dos columnas; sin ellas son una sola columna y a 6xl
 * quedaba más aire que formulario.
 */
const ANCHO = GENERAR_CONTRATOS_DESDE_PLANTILLA ? 'sm:max-w-6xl' : 'sm:max-w-3xl'

type Props = {
  /** Ventana que debe abrirse de entrada (`?nuevo=…`, para los enlaces viejos). */
  abrirInicial: ClaseNuevo | null
  ops: React.ComponentProps<typeof ModoNuevoOps>
  laboral: React.ComponentProps<typeof FormContrato>
}

/**
 * Botones «OPS» y «Laboral» de Contratación y las ventanas emergentes que abren.
 *
 * El alta ya no es una página aparte: se llena en una ventana centrada sobre la
 * lista, igual que los editores de Plantillas. Los formularios son los mismos de
 * siempre; lo único que cambia es dónde se muestran. Al guardar, cada uno lleva
 * al detalle del contrato creado, y con eso la ventana desaparece sola.
 *
 * Un clic fuera no cierra la ventana: el formulario es largo y lleva un PDF con
 * la posición de las firmas ya marcada; perderlo por rozar el fondo sería un
 * disgusto. Se cierra con la X o con Escape, que sí son deliberados.
 */
export function NuevoContrato({ abrirInicial, ops, laboral }: Props) {
  const [abierto, setAbierto] = useState<ClaseNuevo | null>(abrirInicial)

  function cerrar() {
    setAbierto(null)
    // Si se llegó con ?nuevo=…, se quita (y solo eso: la pestaña se queda) para
    // que recargar no vuelva a abrirla.
    if (abrirInicial && typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      if (url.searchParams.has('nuevo')) {
        url.searchParams.delete('nuevo')
        window.history.replaceState(null, '', url.pathname + url.search)
      }
    }
  }

  return (
    <>
      {/* Nombre accesible completo: «OPS» a secas se confunde con la pestaña
          del mismo nombre (en móvil el selector de pestañas es otro botón). */}
      <Button size="sm" aria-label="Nuevo contrato OPS" onClick={() => setAbierto('ops')}>
        <Plus className="size-4" /> OPS
      </Button>
      <Button size="sm" aria-label="Nuevo contrato laboral" onClick={() => setAbierto('laboral')}>
        <Plus className="size-4" /> Laboral
      </Button>

      <Dialog open={abierto === 'ops'} onOpenChange={(o) => !o && cerrar()}>
        <DialogContent
          onOpenAutoFocus={enfocarDialogo}
          onInteractOutside={(e) => e.preventDefault()}
          className={`max-h-[92dvh] overflow-y-auto p-0 ${ANCHO}`}
        >
          {/* El relleno va en este envoltorio y no en DialogContent: ese es el
              contenedor con scroll, y la barra pegajosa de los formularios se
              ciñe a su caja de contenido; con relleno quedaba una franja por la
              que asomaba lo que pasaba por debajo. El min-w-0 repite el que
              DialogContent da a sus hijos directos: sin él, la columna crece al
              ancho mínimo del formulario y en un teléfono se recorta. */}
          <div className="grid gap-4 p-4 [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle>Nuevo contrato OPS</DialogTitle>
            <DialogDescription>
              {GENERAR_CONTRATOS_DESDE_PLANTILLA
                ? 'Prestación de servicios. Redáctalo desde la plantilla o sube el PDF si ya está hecho; en ambos casos se firma en la app.'
                : 'Prestación de servicios. Sube el PDF del contrato ya redactado; el contratista lo firma desde su autoservicio.'}
            </DialogDescription>
          </DialogHeader>
          <ModoNuevoOps {...ops} onCancelar={cerrar} />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={abierto === 'laboral'} onOpenChange={(o) => !o && cerrar()}>
        <DialogContent
          onOpenAutoFocus={enfocarDialogo}
          onInteractOutside={(e) => e.preventDefault()}
          className={`max-h-[92dvh] overflow-y-auto p-0 ${ANCHO}`}
        >
          <div className="grid gap-4 p-4 [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle>Nuevo contrato laboral</DialogTitle>
            <DialogDescription>
              {GENERAR_CONTRATOS_DESDE_PLANTILLA
                ? 'Registra un contrato; si el tipo tiene plantilla, el documento se genera al crear (vista previa a la derecha).'
                : 'Contrato de trabajo. Sube el PDF ya redactado; el empleado lo firma desde su autoservicio y el empleador desde el detalle, salvo que ya venga firmado por él.'}
            </DialogDescription>
          </DialogHeader>
          {/* Sin plantillas, el laboral entra igual que el OPS: PDF subido que se
              firma en la app. Con plantillas, el formulario de siempre con vista previa. */}
          {GENERAR_CONTRATOS_DESDE_PLANTILLA
            ? <FormContrato {...laboral} onCancelar={cerrar} />
            : <ContratoLaboralSubido catalogos={laboral.catalogos} />}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
