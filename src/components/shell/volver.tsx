'use client'

import { Suspense, useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * La flecha de "atrás" de toda la app y la memoria que la hace funcionar.
 *
 * Devuelve a la ÚLTIMA pantalla desde la que se llegó, no a un padre fijo:
 * si a la ficha de una persona se entró desde Vencimientos, la flecha vuelve
 * a Vencimientos; si se entró desde Colaboradores, vuelve a Colaboradores.
 *
 * Para eso `HistorialNavegacion` (montado una vez en el layout de la app) va
 * anotando en sessionStorage cada ruta que se visita, con su query (así una
 * pestaña como `?vista=historial` también se recupera). Se usa esa memoria y
 * no `history.back()` porque el historial del navegador puede llevar fuera de
 * la app (el login, otra pestaña, el correo del que vino el enlace) y porque
 * tras un "atrás" del navegador su pila deja de coincidir con lo que la
 * persona recuerda haber recorrido.
 *
 * Sin memoria (se abrió el enlace directo, pestaña nueva) la flecha va al
 * `fallback`: el padre natural de la ruta, o el que indique la página.
 */

const CLAVE = 'sg:historial'
const MAXIMO = 60

function leerPila(): string[] {
  try {
    const crudo = sessionStorage.getItem(CLAVE)
    const pila = crudo ? (JSON.parse(crudo) as unknown) : []
    return Array.isArray(pila) ? pila.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function guardarPila(pila: string[]) {
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify(pila.slice(-MAXIMO)))
  } catch {
    /* sin sessionStorage (modo privado estricto): la flecha usa el fallback */
  }
}

/** Padre natural de una ruta: se quita el último tramo; la raíz de la app es Inicio. */
export function padreDe(pathname: string): string {
  const tramos = pathname.split('/').filter(Boolean)
  if (tramos.length <= 1) return '/inicio'
  return `/${tramos.slice(0, -1).join('/')}`
}

function Anotador() {
  const pathname = usePathname()
  const search = useSearchParams()
  useEffect(() => {
    const q = search?.toString() ?? ''
    const actual = q ? `${pathname}?${q}` : pathname
    const pila = leerPila()
    const cima = pila[pila.length - 1]
    if (cima === actual) return
    // Cambiar filtros o pestañas de una misma página (solo cambia la query) no
    // es "entrar a otra pantalla": se actualiza la entrada en vez de apilar una
    // por cada filtro, para que la flecha vuelva a la página anterior de verdad.
    if (cima && cima.split('?')[0] === pathname) pila[pila.length - 1] = actual
    else pila.push(actual)
    guardarPila(pila)
  }, [pathname, search])
  return null
}

/** Va en el layout de la app, una sola vez: anota cada ruta visitada. */
export function HistorialNavegacion() {
  // useSearchParams exige Suspense para no bloquear el prerender del layout.
  return (
    <Suspense fallback={null}>
      <Anotador />
    </Suspense>
  )
}

export function BotonVolver({ fallback, etiqueta = 'Volver', className }: {
  /** A dónde ir si no hay memoria de dónde se vino. Por defecto, el padre de la ruta. */
  fallback?: string
  etiqueta?: string
  className?: string
}) {
  const router = useRouter()
  const pathname = usePathname()

  function volver() {
    const pila = leerPila()
    // Se descarta la ruta actual (con o sin query) y se toma la anterior distinta.
    while (pila.length && pila[pila.length - 1].split('?')[0] === pathname) pila.pop()
    const anterior = pila.pop()
    guardarPila(pila)
    router.push(anterior ?? fallback ?? padreDe(pathname))
  }

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      onClick={volver}
      aria-label={etiqueta}
      title={etiqueta}
      className={cn('size-8 shrink-0 rounded-full text-muted-foreground hover:text-foreground', className)}
    >
      <ChevronLeft className="size-[18px]" />
    </Button>
  )
}
