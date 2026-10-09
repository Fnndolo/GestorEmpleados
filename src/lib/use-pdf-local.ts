'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/** Vista previa del archivo original sin duplicarlo como texto base64. */
export function usePdfLocal() {
  const actual = useRef<string | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => () => {
    if (actual.current) URL.revokeObjectURL(actual.current)
  }, [])
  const elegir = useCallback((archivo: File | null) => {
    if (actual.current) URL.revokeObjectURL(actual.current)
    actual.current = archivo ? URL.createObjectURL(archivo) : null
    setUrl(actual.current)
  }, [])
  return [url, elegir] as const
}
