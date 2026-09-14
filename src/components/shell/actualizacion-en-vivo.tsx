'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Mantiene la pantalla al día sin recargar.
 *
 * Lo que uno mismo guarda ya se refleja solo (la acción de servidor trae el
 * contenido nuevo en la misma respuesta). Lo que NO se veía sin recargar era lo
 * que cambian los demás o el cron: la bandeja cuando alguien radica, la lista
 * de contratos cuando otro firma. Este componente consulta el latido del
 * sistema (`/api/latido`: la hora de la última escritura) cada pocos segundos
 * y, si se movió, pide a Next que vuelva a traer los datos de la página en
 * sitio: sin parpadeo, y sin perder lo que se esté escribiendo ni las ventanas
 * abiertas, porque solo se rehacen los componentes de servidor.
 *
 * Es un sondeo y no un canal abierto a propósito: la app corre sin servidor,
 * donde una conexión larga no sobrevive y cuesta más que una consulta ínfima.
 * Solo sondea con la pestaña visible; al volver a ella consulta de inmediato.
 */
const INTERVALO_MS = 6_000
/** Entre dos refrescos seguidos: un rebote de varias escrituras no debe refrescar en cadena. */
const MINIMO_ENTRE_REFRESCOS_MS = 3_000

export function ActualizacionEnVivo() {
  const router = useRouter()
  const ultimo = useRef<string | null>(null)
  const ultimoRefresco = useRef(0)

  useEffect(() => {
    let vivo = true
    let temporizador: ReturnType<typeof setTimeout> | undefined
    let consultando = false

    async function consultar() {
      if (!vivo || consultando || document.visibilityState !== 'visible') return
      consultando = true
      try {
        const r = await fetch('/api/latido', { cache: 'no-store' })
        if (!r.ok) return
        const { cambio } = (await r.json()) as { cambio: string }
        if (ultimo.current === null) {
          // Primera lectura: solo se toma nota; refrescar aquí sería refrescar por nada.
          ultimo.current = cambio
          return
        }
        if (cambio !== ultimo.current) {
          ultimo.current = cambio
          const ahora = Date.now()
          if (ahora - ultimoRefresco.current >= MINIMO_ENTRE_REFRESCOS_MS) {
            ultimoRefresco.current = ahora
            router.refresh()
          }
        }
      } catch {
        // Sin red: se reintenta en el siguiente turno.
      } finally {
        consultando = false
      }
    }

    function programar() {
      temporizador = setTimeout(async () => {
        await consultar()
        if (vivo) programar()
      }, INTERVALO_MS)
    }

    const alVolver = () => { if (document.visibilityState === 'visible') void consultar() }
    void consultar()
    programar()
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('focus', alVolver)
    window.addEventListener('online', alVolver)
    return () => {
      vivo = false
      if (temporizador) clearTimeout(temporizador)
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('focus', alVolver)
      window.removeEventListener('online', alVolver)
    }
  }, [router])

  return null
}
