'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { MoveVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { SelectorFirmasPdf, ETIQUETAS_LABORAL, type Posicion, type Parte } from '@/components/contratos/selector-firmas-pdf'
import { prepararCorreccionFirmaLaboral, corregirPosicionFirmaLaboral } from '@/app/(app)/contratos/acciones'
import { prepararCorreccionFirmaOps, corregirPosicionFirmaOps } from '@/app/(app)/contratos/ops-acciones'

/**
 * Mover la firma de sitio en un contrato (OPS o laboral) que se subió y ya se
 * firmó en la app, sin que nadie firme otra vez.
 *
 * Cuando el recuadro se marcó mal al subir el PDF, el trazo de la persona queda
 * lejos de su línea. Lo que aceptó —el contenido— no cambia; solo cambia dónde
 * la app dibuja su firma. Se abre el PDF ORIGINAL (sin estampar) con la firma
 * real dentro del recuadro, se arrastra a su sitio y el servidor vuelve a
 * estampar y reemplaza el "(firmado)".
 *
 * Las claves del selector son las de OPS: `contratista` es quien se vincula
 * (el trabajador) y `contratante` la empresa. Cada vínculo traduce sus acciones
 * a ese par para que el diálogo sea uno solo.
 */

type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string }
type Preparado = {
  nombre: string
  paginas: number
  pdfBase64: string
  persona: Posicion
  empresa: Posicion | null
  /** La empresa firmó en el PDF aportado: solo se ubica la firma de la persona. */
  empresaEnPdf: boolean
  firmaPersona: string | null
  firmaEmpresa: string | null
}

const ADAPTADORES = {
  LABORAL: {
    etiquetas: ETIQUETAS_LABORAL,
    async preparar(contratoId: string): Promise<Resultado<Preparado>> {
      const r = await prepararCorreccionFirmaLaboral({ contratoId })
      if (!r.ok) return r
      const d = r.datos
      return {
        ok: true,
        datos: {
          nombre: d.nombre, paginas: d.paginas, pdfBase64: d.pdfBase64,
          persona: d.empleado, empresa: d.empleador, empresaEnPdf: d.empleadorEnPdf,
          firmaPersona: d.firmaEmpleado, firmaEmpresa: d.firmaEmpleador,
        },
      }
    },
    guardar(contratoId: string, persona: Posicion, empresa: Posicion | undefined) {
      return corregirPosicionFirmaLaboral({ contratoId, posicionEmpleado: persona, posicionEmpleador: empresa })
    },
  },
  OPS: {
    etiquetas: undefined,
    async preparar(contratoId: string): Promise<Resultado<Preparado>> {
      const r = await prepararCorreccionFirmaOps({ contratoId })
      if (!r.ok) return r
      const d = r.datos
      return {
        ok: true,
        datos: {
          nombre: d.nombre, paginas: d.paginas, pdfBase64: d.pdfBase64,
          persona: d.contratista, empresa: d.contratante, empresaEnPdf: d.contratanteEnPdf,
          firmaPersona: d.firmaContratista, firmaEmpresa: d.firmaContratante,
        },
      }
    },
    guardar(contratoId: string, persona: Posicion, empresa: Posicion | undefined) {
      return corregirPosicionFirmaOps({ contratoId, posicionContratista: persona, posicionContratante: empresa })
    },
  },
} as const

export function CorregirPosicionFirma({ contratoId, vinculo }: { contratoId: string; vinculo: 'OPS' | 'LABORAL' }) {
  const adaptador = ADAPTADORES[vinculo]
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [guardando, empezar] = useTransition()
  const [datos, setDatos] = useState<Preparado | null>(null)
  const [posiciones, setPosiciones] = useState<Record<Parte, Posicion>>({
    contratista: { pagina: 1, x: 80, y: 150, ancho: 150, alto: 45 },
    contratante: { pagina: 1, x: 80, y: 150, ancho: 150, alto: 45 },
  })

  async function abrir() {
    setCargando(true)
    const res = await adaptador.preparar(contratoId)
    setCargando(false)
    if (!res.ok) { toast.error(res.error); return }
    const d = res.datos
    setDatos(d)
    setPosiciones({
      contratista: d.persona,
      contratante: d.empresa ?? { ...d.persona, x: Math.max(0, d.persona.x - 200) },
    })
    setAbierto(true)
  }

  function guardar() {
    if (!datos) return
    empezar(async () => {
      const res = await adaptador.guardar(contratoId, posiciones.contratista, datos.empresaEnPdf ? undefined : posiciones.contratante)
      if (!res.ok) { toast.error(res.error); return }
      toast.success(
        res.datos.reestampado
          ? 'Posición corregida. El PDF firmado se volvió a generar con la firma en su sitio.'
          : 'Posición corregida. Se usará cuando el contrato termine de firmarse.',
      )
      setAbierto(false)
      router.refresh()
    })
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={abrir} disabled={cargando}>
        {cargando ? <Spinner /> : <MoveVertical className="size-4" />} Corregir posición de la firma
      </Button>

      {abierto && datos && (
        <Dialog open onOpenChange={(o) => !o && setAbierto(false)}>
          <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Corregir dónde va la firma</DialogTitle>
              <DialogDescription>
                Arrastra cada firma hasta su línea dentro de {datos.nombre}. Nadie vuelve a firmar:
                se conservan las firmas ya hechas y solo se vuelve a dibujar el PDF firmado con ellas
                en el sitio correcto. La corrección queda anotada en el rastro de firma.
              </DialogDescription>
            </DialogHeader>

            <SelectorFirmasPdf
              pdfDataUri={datos.pdfBase64}
              paginas={datos.paginas}
              valor={posiciones}
              onChange={setPosiciones}
              partes={datos.empresaEnPdf ? ['contratista'] : ['contratante', 'contratista']}
              etiquetas={adaptador.etiquetas}
              imagenes={{ contratista: datos.firmaPersona, contratante: datos.firmaEmpresa }}
            />

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
              <Button onClick={guardar} disabled={guardando}>
                {guardando && <Spinner />} Guardar y volver a generar el PDF
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
