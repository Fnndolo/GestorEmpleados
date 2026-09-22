'use client'

import { usePathname } from 'next/navigation'
import { BotonVolver } from '@/components/shell/volver'
import { GRUPOS } from './secciones'

/**
 * Cabecera de Ajustes, igual que la de SST: flecha para devolverse y la ruta en
 * pequeño. El título grande de cada sección lo pone su propia página, que es
 * donde da jerarquía. Como la flecha vive aquí, las páginas del módulo NO
 * llevan la suya (`Encabezado` sin `volver`): una sola por pantalla.
 *
 * La flecha devuelve a la última pantalla desde la que se llegó (ver
 * `BotonVolver`). Sin memoria —enlace directo, pestaña nueva— usa un respaldo
 * según dónde se esté: en la portada (Empresa) sale del módulo a Inicio, en una
 * sección va a la portada y en una ruta hija (el editor de una plantilla) sube
 * al padre natural, que `BotonVolver` calcula solo.
 *
 * Es cliente porque necesita la ruta actual para saber en qué sección estás.
 */
export function CabeceraAjustes({ portada }: {
  /**
   * Respaldo de la flecha en las secciones: normalmente Empresa, pero quien
   * solo tiene permiso de Usuarios no puede entrar ahí, así que el layout le
   * manda Inicio.
   */
  portada: string
}) {
  const ruta = usePathname()

  // La sección activa; `startsWith` cubre las rutas hijas (el editor de una
  // plantilla sigue mostrando "Plantillas de documentos" en la ruta).
  const seccion = GRUPOS.flatMap((g) => g.secciones).find(
    (s) => ruta === s.href || ruta.startsWith(`${s.href}/`),
  )
  // Empresa es la portada de Ajustes: ahí la flecha sale del módulo, no vuelve
  // a un nivel que no existe (/configuracion solo redirige a Empresa).
  const esPortada = !seccion || seccion.href === '/configuracion/empresa'
  const esHija = !!seccion && ruta !== seccion.href
  const respaldo = esPortada ? '/inicio' : esHija ? undefined : portada

  return (
    <div className="mb-3 flex shrink-0 items-center gap-2">
      <BotonVolver fallback={respaldo} />
      <nav aria-label="Ruta" className="flex min-w-0 items-center gap-1.5 text-[13.5px] font-semibold">
        <span className="truncate">Ajustes</span>
        {!esPortada && seccion && (
          <>
            <span className="font-normal text-muted-foreground">›</span>
            <span className="truncate font-medium text-muted-foreground">{seccion.titulo}</span>
          </>
        )}
      </nav>
    </div>
  )
}
