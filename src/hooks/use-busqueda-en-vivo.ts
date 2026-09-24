'use client'

import { useEffect, useState } from 'react'

/**
 * Búsqueda que filtra mientras se escribe: guarda lo tecleado y, cuando la
 * persona deja de escribir `espera` ms, llama a `buscar` con el texto. La lista
 * vive en la URL (`?q=`), así que `actual` es lo que ya está buscado: si el
 * texto coincide no se vuelve a navegar (ni al montar, ni tras llegar).
 */
export function useBusquedaEnVivo(actual: string, buscar: (texto: string) => void, espera = 300) {
  const [texto, setTexto] = useState(actual)

  useEffect(() => {
    if (texto.trim() === actual.trim()) return
    const t = setTimeout(() => buscar(texto), espera)
    return () => clearTimeout(t)
    // `buscar` cambia en cada render del padre; lo que dispara la búsqueda es el texto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto, actual, espera])

  return [texto, setTexto] as const
}
