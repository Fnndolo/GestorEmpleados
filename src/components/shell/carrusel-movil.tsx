'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

/**
 * Fila deslizable de casillas para el celular, compartida por el autoservicio
 * y el inicio: en un teléfono las cuadrículas de módulos se volvían una pared
 * de desplazamiento, y así cada sección ocupa una sola fila.
 */

/**
 * Ancho de cada casilla del carrusel móvil, calculado para que en pantalla
 * quepan exactamente 4 tiles y MEDIO: el quinto asoma cortado por la mitad y
 * eso, más el degradado del borde, le dice al pulgar que hay más a la derecha.
 * Con el ancho natural del tile (72px) el corte caía donde cayera según el
 * teléfono; a veces justo en el borde y parecía que la fila terminaba ahí.
 *
 * La cuenta: el 100% es el ancho de contenido del carrusel (pantalla − 2rem de
 * padding). Lo visible desde la primera casilla hasta el borde derecho de la
 * pantalla es ese 100% + el 1rem de padding derecho. Ahí caben 4.5 casillas y
 * los 4 huecos de 0.5rem entre ellas (2rem): 4.5·w = 100% + 1rem − 2rem.
 */
export const ANCHO_CASILLA = 'basis-[calc((100%-1rem)/4.5)]'

/** ¿Queda contenido a la derecha? El −1 absorbe el redondeo de subpíxeles, que
 *  si no dejaba el degradado prendido con el carrusel ya al tope. */
function quedaPorVer(el: HTMLElement): boolean {
  return el.scrollLeft + el.clientWidth < el.scrollWidth - 1
}

/**
 * Se sale del margen del contenido para llegar al borde de la pantalla, y
 * sombrea el borde derecho con un degradado hacia el fondo mientras quede algo
 * por ver: cuando el usuario llega al final el degradado se apaga, porque
 * seguir insinuando "hay más" cuando no hay más es mentirle.
 */
export function CarruselMovil({ children }: { children: React.ReactNode }) {
  const [hayMas, setHayMas] = useState(false)
  // El ref hace la medición inicial y vuelve a medir si cambia el tamaño (girar
  // el teléfono); el onScroll cubre el desplazamiento. React 19 acepta que el
  // ref devuelva su limpieza, así el observer se suelta con el elemento.
  const observar = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    const actualizar = () => setHayMas(quedaPorVer(el))
    actualizar()
    const ro = new ResizeObserver(actualizar)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="relative -mx-4 sm:hidden">
      <div
        ref={observar}
        onScroll={(e) => setHayMas(quedaPorVer(e.currentTarget))}
        className={cn(
          'flex snap-x gap-2 overflow-x-auto px-4 scroll-pl-4',
          // El desplazamiento horizontal recorta lo que se salga por arriba, y
          // la insignia de pendientes sobresale del ícono: sin este respiro
          // aparecía cortada por la mitad.
          'pt-2',
          '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        )}
      >
        {children}
      </div>
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-background via-background/70 to-transparent',
          'transition-opacity duration-300',
          hayMas ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  )
}

/** Envoltorio de cada casilla dentro del carrusel: ancho fijo y centrada. */
export function Casilla({ children }: { children: React.ReactNode }) {
  return <div className={cn('flex shrink-0 snap-start justify-center', ANCHO_CASILLA)}>{children}</div>
}

/**
 * Casilla de móvil: solo el ícono dentro del recuadro y el nombre debajo, fuera.
 *
 * En una pantalla de teléfono la descripción no aporta —el nombre ya dice qué
 * es— y obligaba a recuadros altos. Sacando el texto del recuadro, cada módulo
 * ocupa poco más que su ícono y caben todos casi sin bajar.
 */
export function CasillaCompacta({
  icono: Icono, titulo, aviso, nuevo, href, onClick,
}: {
  icono: React.ElementType
  /** Nombre corto: el largo se parte feo bajo un ícono. */
  titulo: string
  /** Estado real que exige atención ("3 pendientes"): se pinta el número sobre el ícono. */
  aviso?: string | null
  /** Recién habilitado, para que la gente lo note. */
  nuevo?: boolean
  href?: string
  onClick?: () => void
}) {
  const contenido = (
    <>
      <span className="relative">
        <span className={cn('grid size-16 place-items-center rounded-2xl border bg-card', 'transition-colors group-active/t:bg-accent')}>
          {/* Chip e icono algo más grandes que en escritorio: a este tamaño el
              icono se leía chico y el recuadro de 64 px lo aguanta sin apretar. */}
          <span className="grid size-11 place-items-center rounded-xl bg-foreground text-background">
            <Icono className="size-[22px]" />
          </span>
        </span>
        {/* Lo pendiente se marca sobre el ícono, como una notificación: en este
            tamaño una etiqueta con texto no cabe sin descuadrar la fila. */}
        {aviso ? (
          <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-amber-500 px-1 text-center text-[10px] font-bold leading-4 text-white">
            {aviso.match(/\d+/)?.[0] ?? '!'}
          </span>
        ) : nuevo ? (
          <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-emerald-500 ring-2 ring-background" />
        ) : null}
      </span>
      {/* Alto fijo de dos líneas: sin esto los nombres de una sola línea suben y
          los de dos bajan, y la fila queda con los íconos a distinta altura. */}
      <span className="-mx-1 mt-1 line-clamp-2 block h-[24px] w-[72px] text-center text-[10px] font-medium leading-[12px]">
        {titulo}
      </span>
    </>
  )
  const clases = 'group/t flex shrink-0 flex-col items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-2xl'
  return href
    ? <Link href={href} className={clases}>{contenido}</Link>
    : <button type="button" onClick={onClick} className={clases}>{contenido}</button>
}
