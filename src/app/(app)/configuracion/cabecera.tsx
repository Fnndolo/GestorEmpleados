'use client'

import { useRouter, usePathname } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GRUPOS } from './secciones'

/**
 * Cabecera de Ajustes, igual que la de SST: flecha para devolverse y la ruta en
 * pequeño. El título grande de cada sección lo pone su propia página, que es
 * donde da jerarquía.
 *
 * Es cliente porque necesita la ruta actual para saber en qué sección estás.
 */
export function CabeceraAjustes() {
  const router = useRouter()
  const ruta = usePathname()

  // La sección activa; `startsWith` cubre las rutas hijas (el editor de una
  // plantilla sigue mostrando "Plantillas de documentos" en la ruta).
  const seccion = GRUPOS.flatMap((g) => g.secciones).find(
    (s) => ruta === s.href || ruta.startsWith(`${s.href}/`),
  )
  // Empresa es la portada de Ajustes: ahí la flecha sale del módulo, no vuelve
  // a un nivel que no existe.
  const esPortada = !seccion || seccion.href === '/configuracion/empresa'

  return (
    <div className="mb-3 flex shrink-0 items-center gap-2">
      <Button
        size="icon"
        variant="ghost"
        className="size-8 shrink-0 text-muted-foreground"
        aria-label={esPortada ? 'Salir de Ajustes' : 'Volver a Ajustes'}
        onClick={() => (esPortada ? router.push('/') : router.push('/configuracion/empresa'))}
      >
        <ChevronLeft className="size-[18px]" />
      </Button>
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
