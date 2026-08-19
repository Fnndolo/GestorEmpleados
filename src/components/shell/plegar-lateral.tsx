'use client'

import { useSyncExternalStore } from 'react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const CLAVE = 'lateral-oculto'
const EVENTO = 'lateral-cambio'

/**
 * El estado real no vive en React: vive en un atributo del <html>, y lo aplica
 * el CSS. Así el layout —que es un componente de servidor— no tiene que
 * volverse cliente, y la elección sobrevive a la navegación entre páginas sin
 * remontar nada.
 *
 * `useSyncExternalStore` es la forma correcta de leer ese estado externo: da el
 * valor del servidor en el render inicial (siempre visible) y se sincroniza al
 * hidratar, sin escribir estado dentro de un efecto.
 */
function suscribir(alCambiar: () => void) {
  window.addEventListener(EVENTO, alCambiar)
  return () => window.removeEventListener(EVENTO, alCambiar)
}
const estaOculto = () => document.documentElement.dataset.lateral === 'oculto'
const enElServidor = () => false

/**
 * Pliega y despliega el menú lateral. Solo en escritorio: en móvil el menú ya
 * es un cajón que se abre y cierra.
 *
 * Hay dos instancias, y por eso la variante:
 * - `lateral` vive junto al logo, dentro del menú. Es la de siempre, y
 *   desaparece con el menú al plegarlo.
 * - `barra` vive en la barra superior y SOLO se ve cuando está plegado; sin
 *   ella no quedaría forma de volver a abrirlo.
 */
export function PlegarLateral({ variante = 'lateral' }: { variante?: 'lateral' | 'barra' }) {
  const oculto = useSyncExternalStore(suscribir, estaOculto, enElServidor)

  function alternar() {
    const raiz = document.documentElement
    if (oculto) {
      delete raiz.dataset.lateral
      try { localStorage.removeItem(CLAVE) } catch { /* modo privado */ }
    } else {
      raiz.dataset.lateral = 'oculto'
      try { localStorage.setItem(CLAVE, '1') } catch { /* modo privado */ }
    }
    window.dispatchEvent(new Event(EVENTO))
  }

  const etiqueta = oculto ? 'Mostrar el menú lateral' : 'Ocultar el menú lateral'

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      onClick={alternar}
      className={cn(
        'hidden size-8 shrink-0 text-muted-foreground lg:inline-flex',
        // La de la barra la muestra el CSS solo con el menú plegado.
        variante === 'barra' && 'mostrar-lateral',
      )}
      aria-pressed={oculto}
      aria-label={etiqueta}
      title={etiqueta}
    >
      {oculto ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
    </Button>
  )
}

/**
 * Aplica la preferencia guardada ANTES del primer pintado. Sin esto, el menú
 * aparecería un instante y se plegaría después, que es peor que no tener la
 * función.
 */
export function ScriptLateral() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `try{if(localStorage.getItem('${CLAVE}'))document.documentElement.dataset.lateral='oculto'}catch(e){}`,
      }}
    />
  )
}
