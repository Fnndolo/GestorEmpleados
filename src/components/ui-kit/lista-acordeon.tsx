'use client'

import { useState } from 'react'
import { ChevronDown, type LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { Chip, AvatarColaborador, type ChipColor } from './index'

export type ItemAcordeon = {
  id: string
  titulo: string
  sub: string
  /** Detalle expandido: pares etiqueta → valor. */
  campos: { label: string; valor: string }[]
  /** Chip de categoría propio del ítem (si no, se usa el de la lista). */
  chip?: { icono: LucideIcon; color: ChipColor | string }
  /** Foto de perfil junto al chip (colaborador dueño del registro). */
  avatar?: { colaboradorId: string; fotoUrl: string | null; nombre: string }
  /** Contenido a la derecha de la fila (badge de estado, acción); vive fuera del botón. */
  derecha?: React.ReactNode
  /** Contenido extra dentro del panel expandido, debajo de los campos. */
  extra?: React.ReactNode
}

/** A partir de este largo un valor es "texto" (un motivo, una observación) y no un dato. */
const LARGO_TEXTO = 40

/**
 * Detalle del ítem: los datos cortos (fecha, días, origen…) juntos en una fila
 * compacta, y los textos largos debajo a todo el ancho. En una cuadrícula de
 * columnas iguales la fecha se quedaba con un tercio de la fila y el motivo,
 * que es lo que más se lee, apretado en otro tercio.
 */
function Campos({ campos }: { campos: ItemAcordeon['campos'] }) {
  const cortos = campos.filter((c) => c.valor.length <= LARGO_TEXTO)
  const largos = campos.filter((c) => c.valor.length > LARGO_TEXTO)
  return (
    <dl className="space-y-3">
      {cortos.length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:flex sm:flex-wrap sm:gap-x-10">
          {cortos.map((cpo) => (
            <div key={cpo.label} className="min-w-0">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{cpo.label}</dt>
              <dd className="text-sm">{cpo.valor}</dd>
            </div>
          ))}
        </div>
      )}
      {largos.map((cpo) => (
        <div key={cpo.label}>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{cpo.label}</dt>
          <dd className="max-w-4xl text-sm leading-relaxed break-words whitespace-pre-line">{cpo.valor}</dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * Lista con detalle expandible (acordeón) — el patrón de "Mi actividad" de
 * autoservicio: fila compacta con chip de categoría (y foto si aplica), al
 * presionar se expande su detalle y se cierra la anterior.
 */
export function ListaAcordeon({ items, chip, compactoEnMovil = false }: {
  items: ItemAcordeon[]
  /** Chip por defecto para toda la lista (cada ítem puede traer el suyo). */
  chip?: { icono: LucideIcon; color: ChipColor | string }
  /**
   * En el celular, fila mínima: foto, nombre y debajo del nombre lo de la
   * derecha (origen, soporte, estado). El subtítulo se oculta: está en el
   * detalle al expandir. En pantallas anchas no cambia nada.
   */
  compactoEnMovil?: boolean
}) {
  const [abierta, setAbierta] = useState<string | null>(null)
  return (
    <Card><CardContent className="divide-y p-0">
      {items.map((x) => {
        const expandida = abierta === x.id
        const c = x.chip ?? chip
        return (
          <div key={x.id}>
            <div className="flex flex-wrap items-center gap-2 pr-3">
              <button
                type="button"
                onClick={() => setAbierta(expandida ? null : x.id)}
                aria-expanded={expandida}
                className="flex min-w-56 flex-1 items-center gap-3 p-3 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                {/* La foto identifica a la persona mejor que el ícono de categoría: con
                    avatar, el chip de color sobra (y compite por el mismo espacio). */}
                {x.avatar ? (
                  <AvatarColaborador nombre={x.avatar.nombre} fotoUrl={x.avatar.fotoUrl} />
                ) : (
                  c && <Chip icono={c.icono} color={c.color} />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{x.titulo}</p>
                  <p className={cn('truncate text-xs text-muted-foreground', compactoEnMovil && 'hidden sm:block')}>{x.sub}</p>
                </div>
                <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', expandida && 'rotate-180')} />
              </button>
              {/* Envuelve en su propia fila si no cabe: la Card recorta lo que se
                  sale (overflow-hidden por las esquinas redondeadas), así que sin
                  esto las píldoras de la derecha quedaban cortadas a mitad de palabra.
                  El min-w-56 del botón decide cuándo: si el nombre y el detalle no
                  tendrían ni eso, las píldoras bajan en vez de aplastar el texto. */}
              {/* Compacto en el celular: siempre en su propia línea, alineada bajo el
                  nombre (pl-14 = relleno + foto + separación del botón). */}
              {x.derecha && (
                <div className={cn(
                  'flex flex-wrap items-center gap-2',
                  compactoEnMovil
                    ? 'order-last -mt-2 basis-full pb-2.5 pl-14 sm:order-none sm:mt-0 sm:basis-auto sm:shrink-0 sm:justify-end sm:py-1 sm:pl-3'
                    : 'shrink-0 justify-end py-1 pl-3',
                )}>
                  {x.derecha}
                </div>
              )}
            </div>
            {expandida && (
              <div className="space-y-3 border-t border-dashed bg-muted/20 px-4 py-3 animate-in fade-in slide-in-from-top-1 duration-150">
                {x.campos.length > 0 && <Campos campos={x.campos} />}
                {x.extra}
              </div>
            )}
          </div>
        )
      })}
    </CardContent></Card>
  )
}
