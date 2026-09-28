'use client'

import { filtrarSecciones } from '@/lib/navegacion'
import { CarruselMovil, Casilla, CasillaCompacta, RejillaCasillas } from '@/components/shell/carrusel-movil'

/**
 * Los módulos del inicio con el diseño del autoservicio: la misma casilla
 * (ícono y nombre, sin descripción) en rejilla en escritorio, más grande, y en
 * carrusel en el celular, una fila por sección. Recibe solo datos
 * serializables (los hrefs que el usuario puede ver) e importa la
 * configuración de navegación por su cuenta para los iconos.
 */

/** Nombre corto para el celular: el largo se parte feo bajo un ícono. */
const CORTO: Record<string, string> = {
  '/contratos': 'Contratos',
  '/activos': 'Activos',
  '/calendario-legal': 'Calendario',
  '/configuracion': 'Ajustes',
  '/terminaciones': 'Retiros',
  '/capacitaciones': 'Cursos',
}

type Aviso = { texto: string; tono: 'bad' | 'warn' }

export function ModulosInicio({ hrefsVisibles, avisos }: {
  hrefsVisibles: string[]
  /** Lo que exige atención por módulo ("3 vencidos", "2 pendientes"). */
  avisos: Record<string, Aviso>
}) {
  const secciones = filtrarSecciones(hrefsVisibles)
    .map((s) => ({ ...s, items: s.items.filter((i) => i.href !== '/inicio') }))
    .filter((s) => s.items.length > 0)

  return (
    // En escritorio las secciones cortas se acomodan una al lado de la otra:
    // cada una ocupa solo el ancho de sus casillas y no un renglón entero.
    <div className="sm:flex sm:flex-wrap sm:gap-x-10">
      {secciones.map((seccion) => (
        // En el celular las secciones van pegadas: separadas de más parecían
        // dos pantallas distintas y la segunda quedaba lejos del pulgar.
        <section key={seccion.titulo} className="mt-3 sm:mt-6 sm:max-w-full">
          <h2 className="mb-2 text-[13px] font-bold sm:mb-2.5">{seccion.titulo}</h2>

          {/* Escritorio */}
          <RejillaCasillas>
            {seccion.items.map((item) => (
              <CasillaCompacta
                key={item.href}
                grande
                icono={item.icono}
                titulo={item.titulo}
                aviso={avisos[item.href]?.texto ?? null}
                href={item.href}
              />
            ))}
          </RejillaCasillas>

          {/* Móvil */}
          <CarruselMovil>
            {seccion.items.map((item) => (
              <Casilla key={item.href}>
                <CasillaCompacta
                  icono={item.icono}
                  titulo={CORTO[item.href] ?? item.titulo}
                  aviso={avisos[item.href]?.texto ?? null}
                  href={item.href}
                />
              </Casilla>
            ))}
          </CarruselMovil>
        </section>
      ))}
    </div>
  )
}
