'use client'

import { useState, type ReactNode } from 'react'
import { FileText, ShieldCheck, FilePenLine, ChevronDown, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Pill, type PillTone } from '@/components/ui-kit'
import { buttonVariants } from '@/components/ui/button'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { Card, CardContent } from '@/components/ui/card'
import { documentosVisibles, type FirmaContrato } from '@/lib/contratos/tarjeta'

/**
 * La tarjeta de un contrato, igual en el autoservicio (Mis contratos) y en la
 * pestaña Contrato de la ficha del colaborador.
 *
 * Plegada: el número, el estado y dos líneas bastan para ubicarse. Al
 * desplegarla salen los documentos (se abren en el visor, aquí mismo) y lo que
 * cada pantalla agrega debajo (`children`): la firma propia en el autoservicio,
 * las firmas y los detalles en la ficha. Lo que exige actuar (`accion`) no se
 * esconde nunca.
 */
export type DatosTarjetaContrato = {
  numero: string
  /** Estado del contrato (ACTIVO, TERMINADO…). */
  estado: string
  firma: FirmaContrato
  /** Cargo/objeto y tipo en una línea. */
  resumen: string
  vigenciaCorta: string
  valor: string
  documentos: { id: string; nombre: string }[]
}

const ESTADO: Record<string, string> = {
  BORRADOR: 'Borrador', ACTIVO: 'Activo', FIRMADO: 'Firmado', SUSPENDIDO: 'Suspendido', TERMINADO: 'Terminado',
}
const TONO: Record<string, PillTone> = {
  BORRADOR: 'muted', ACTIVO: 'ok', FIRMADO: 'ok', SUSPENDIDO: 'warn', TERMINADO: 'muted',
}

/** Sin acentos y en minúsculas: los documentos viejos guardan el nombre del archivo. */
export function esAutorizacion(nombre: string): boolean {
  return nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes('autoriz')
}

/**
 * Etiqueta del documento. La autorización se rotula por lo que es; el resto
 * muestra su propio nombre: rotular todo como "Contrato" dejaría filas
 * idénticas cuando un contrato viejo trae dos PDF escaneados.
 */
export function etiquetaDoc(nombre: string): string {
  return esAutorizacion(nombre) ? 'Autorización de datos' : nombre
}

export function TarjetaContrato({ c, etiquetas, accion, children, abiertoInicial = false }: {
  c: DatosTarjetaContrato
  /** Pastillas extra junto al estado (p. ej. otrosíes por firmar). */
  etiquetas?: ReactNode
  /** Lo que hay que hacer ya (p. ej. firmar): visible aun con la tarjeta plegada. */
  accion?: ReactNode
  children?: ReactNode
  abiertoInicial?: boolean
}) {
  const [expandido, setExpandido] = useState(abiertoInicial)
  const documentos = documentosVisibles(c.documentos)

  return (
    <Card>
      <CardContent className="py-3">
        <button
          type="button"
          onClick={() => setExpandido((v) => !v)}
          aria-expanded={expandido}
          className="flex w-full items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-foreground text-background">
            <FilePenLine className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-bold">{c.numero}</span>
              <Pill tone={TONO[c.estado] ?? 'muted'}>{ESTADO[c.estado] ?? c.estado}</Pill>
              {/* Un OPS en estado FIRMADO ya lo dice en su estado. */}
              {c.firma === 'completa' && c.estado !== 'FIRMADO' && <Pill tone="ok">Firmado</Pill>}
              {c.firma === 'pendiente' && <Pill tone="warn">Por firmar</Pill>}
              {etiquetas}
            </span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{c.resumen}</span>
            <span className="block text-xs text-muted-foreground">{c.vigenciaCorta} · {c.valor}</span>
          </span>
          <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', expandido && 'rotate-180')} />
        </button>

        {accion && <div className="mt-3">{accion}</div>}

        {expandido && (
          <div className="mt-3 space-y-3 border-t pt-3">
            {documentos.length > 0 && (
              <ul className="divide-y rounded-lg border px-3">
                {documentos.map((d) => {
                  const Icono = esAutorizacion(d.nombre) ? ShieldCheck : FileText
                  return (
                    <li key={d.id} className="flex items-center gap-2.5 py-1.5 text-sm">
                      <Icono className="size-4 shrink-0 text-muted-foreground" />
                      {/* Los nombres heredados de archivos escaneados son largos: se recortan. */}
                      <span className="min-w-0 flex-1 truncate">{etiquetaDoc(d.nombre)}</span>
                      <VisorPdf documentoId={d.id} titulo={d.nombre} className={buttonVariants({ size: 'sm' }) + ' shrink-0'}>
                        <Eye className="size-3.5" /> Ver
                      </VisorPdf>
                    </li>
                  )
                })}
              </ul>
            )}
            {children}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
