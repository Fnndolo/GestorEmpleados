'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
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

/** ¿Hay contenido a la izquierda? (ya se desplazó). */
function quedaAntes(el: HTMLElement): boolean {
  return el.scrollLeft > 1
}

/**
 * Carrusel de escritorio: el mismo del celular, con las casillas grandes. Cada
 * sección va en su propio renglón y, si la ventana no alcanza para todas sus
 * casillas, el renglón se desliza en vez de bajar a otra línea. Como con el
 * mouse no se desliza con el dedo, aparecen flechas a los lados mientras quede
 * algo por ver, junto con el degradado que lo insinúa.
 */
export function CarruselEscritorio({ children }: { children: React.ReactNode }) {
  const [antes, setAntes] = useState(false)
  const [despues, setDespues] = useState(false)
  const [pista, setPista] = useState<HTMLDivElement | null>(null)
  const medir = useCallback((el: HTMLElement) => {
    setAntes(quedaAntes(el))
    setDespues(quedaPorVer(el))
  }, [])
  const observar = useCallback((el: HTMLDivElement | null) => {
    setPista(el)
    if (!el) return
    medir(el)
    const ro = new ResizeObserver(() => medir(el))
    ro.observe(el)
    return () => ro.disconnect()
  }, [medir])
  // Cada flecha avanza casi una pantalla de casillas, dejando una a la vista
  // como referencia de dónde se venía.
  const mover = (sentido: 1 | -1) => pista?.scrollBy({ left: sentido * Math.max(pista.clientWidth - 128, 128), behavior: 'smooth' })

  const flecha = 'absolute top-[3.5rem] z-10 grid size-8 -translate-y-1/2 place-items-center rounded-full border bg-background shadow-md transition-opacity duration-300 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
  return (
    <div className="relative hidden sm:block">
      <div
        ref={observar}
        onScroll={(e) => medir(e.currentTarget)}
        className={cn(
          'flex snap-x gap-2 overflow-x-auto scroll-smooth',
          // Respiro arriba para la insignia de pendientes, que sobresale del recuadro.
          'pt-2',
          '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        )}
      >
        {children}
      </div>
      <div aria-hidden className={cn('pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-background via-background/70 to-transparent transition-opacity duration-300', antes ? 'opacity-100' : 'opacity-0')} />
      <div aria-hidden className={cn('pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-background via-background/70 to-transparent transition-opacity duration-300', despues ? 'opacity-100' : 'opacity-0')} />
      <button type="button" onClick={() => mover(-1)} aria-label="Ver anteriores" tabIndex={antes ? 0 : -1}
        className={cn(flecha, 'left-1', antes ? 'opacity-100' : 'pointer-events-none opacity-0')}>
        <ChevronLeft className="size-4" />
      </button>
      <button type="button" onClick={() => mover(1)} aria-label="Ver más" tabIndex={despues ? 0 : -1}
        className={cn(flecha, 'right-1', despues ? 'opacity-100' : 'pointer-events-none opacity-0')}>
        <ChevronRight className="size-4" />
      </button>
    </div>
  )
}

/**
 * Casilla de módulo: solo el ícono dentro del recuadro y el nombre debajo,
 * fuera. Sin descripción: el nombre ya dice qué es, y la descripción obligaba
 * a recuadros altos. Es la misma en el celular y, más grande (`grande`), en
 * escritorio.
 */
export function CasillaCompacta({
  icono: Icono, titulo, aviso, nuevo, href, onClick, grande = false,
}: {
  icono: React.ElementType
  /** Nombre corto en el celular: el largo se parte feo bajo un ícono. */
  titulo: string
  /** Estado real que exige atención ("3 pendientes"): se pinta el número sobre el ícono. */
  aviso?: string | null
  /** Recién habilitado, para que la gente lo note. */
  nuevo?: boolean
  href?: string
  onClick?: () => void
  /** Tamaño de escritorio: recuadro, ícono y nombre más grandes. */
  grande?: boolean
}) {
  const contenido = (
    <>
      <span className="relative">
        <span className={cn(
          'grid place-items-center border bg-card transition-all group-active/t:bg-accent',
          grande
            ? 'size-24 rounded-3xl group-hover/t:-translate-y-0.5 group-hover/t:border-foreground/20 group-hover/t:shadow-md'
            : 'size-16 rounded-2xl',
        )}>
          <span className={cn('grid place-items-center bg-foreground text-background', grande ? 'size-14 rounded-2xl' : 'size-11 rounded-xl')}>
            <Icono className={grande ? 'size-7' : 'size-[22px]'} />
          </span>
        </span>
        {/* Lo pendiente se marca sobre el ícono, como una notificación: una
            etiqueta con texto no cabe sin descuadrar la fila. */}
        {aviso ? (
          <span className={cn(
            'absolute rounded-full bg-amber-500 text-center font-bold text-white',
            grande ? '-right-1.5 -top-1.5 min-w-6 px-1.5 text-xs leading-6' : '-right-1 -top-1 min-w-4 px-1 text-[10px] leading-4',
          )}>
            {aviso.match(/\d+/)?.[0] ?? '!'}
          </span>
        ) : nuevo ? (
          <span className={cn('absolute rounded-full bg-emerald-500 ring-2 ring-background', grande ? '-right-1 -top-1 size-3.5' : '-right-0.5 -top-0.5 size-2.5')} />
        ) : null}
      </span>
      {/* Alto fijo de dos líneas: sin esto los nombres de una sola línea suben y
          los de dos bajan, y la fila queda con los íconos a distinta altura. */}
      <span className={cn(
        'line-clamp-2 block text-center font-medium',
        grande ? 'mt-2 h-[36px] w-28 text-[13px] leading-[18px]' : '-mx-1 mt-1 h-[24px] w-[72px] text-[10px] leading-[12px]',
      )}>
        {titulo}
      </span>
    </>
  )
  const clases = cn(
    'group/t flex shrink-0 flex-col items-center rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    grande && 'w-[7.5rem] snap-start',
  )
  return href
    ? <Link href={href} className={clases}>{contenido}</Link>
    : <button type="button" onClick={onClick} className={clases}>{contenido}</button>
}
