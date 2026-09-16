'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { filtrarSecciones, type ItemNav } from '@/lib/navegacion'
import { CarruselMovil, Casilla, CasillaCompacta } from '@/components/shell/carrusel-movil'

/**
 * Los módulos del inicio con las dos caras del autoservicio: cuadrícula con
 * descripción en escritorio y carrusel de casillas en el celular, una fila por
 * sección. Recibe solo datos serializables (los hrefs que el usuario puede ver)
 * e importa la configuración de navegación por su cuenta para los iconos.
 */

/** Descripción de cada módulo, solo para escritorio. */
const DESCRIPCION: Record<string, string> = {
  '/vencimientos': 'Alertas de contratos, exámenes y cursos',
  '/colaboradores': 'Fichas, documentos y organigrama',
  '/contratos': 'OPS, cuentas de cobro y firmas',
  '/nomina': 'Periodos, liquidación y desprendibles',
  '/novedades': 'Ausencias, horas extra y ajustes',
  '/activos': 'Equipos y dotación entregada',
  '/capacitaciones': 'Cursos y asistencia del personal',
  '/evaluaciones': 'Desempeño y periodo de prueba',
  '/cumpleanos': 'Celebraciones y sus facturas',
  '/terminaciones': 'Retiros y liquidación final',
  '/juridica': 'Disciplinarios, anti-acoso y habeas data',
  '/calendario-legal': 'Obligaciones y fechas legales',
  '/sst': 'Seguridad y salud en el trabajo',
  '/autoservicio': 'Tus vacaciones, permisos y certificados',
  '/autoservicio/aprobaciones': 'Solicitudes de tu equipo por aprobar',
  '/reportes': 'Indicadores y exportes',
  '/configuracion': 'Empresa, sedes, cargos y roles',
}

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
    <>
      {secciones.map((seccion) => (
        // En el celular las secciones van pegadas: separadas de más parecían
        // dos pantallas distintas y la segunda quedaba lejos del pulgar.
        <section key={seccion.titulo} className="mt-3 sm:mt-6">
          <h2 className="mb-2 text-[13px] font-bold sm:mb-2.5">{seccion.titulo}</h2>

          {/* Escritorio */}
          <div className="hidden gap-2.5 sm:grid sm:grid-cols-3 lg:grid-cols-4">
            {seccion.items.map((item) => <Tile key={item.href} item={item} aviso={avisos[item.href]} />)}
          </div>

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
    </>
  )
}

/** Tarjeta de escritorio: hay ancho para el título largo y la descripción. */
function Tile({ item, aviso }: { item: ItemNav; aviso?: Aviso }) {
  const Icono = item.icono
  const desc = DESCRIPCION[item.href]
  return (
    <Link
      href={item.href}
      className={cn(
        'rounded-xl border bg-card p-3.5 text-left transition-all',
        'hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      )}
    >
      {/* Todos los iconos en tinta: el color queda para lo que exige atención. */}
      <span className="mb-2.5 grid size-9 place-items-center rounded-[9px] bg-foreground text-background">
        <Icono className="size-[18px]" />
      </span>
      <span className="block text-[13px] font-semibold leading-tight">{item.titulo}</span>
      {desc && <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{desc}</span>}
      {aviso && (
        <span className={cn(
          'mt-2 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-bold',
          aviso.tono === 'bad' ? 'bg-rose-500/12 text-rose-700 dark:text-rose-400' : 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
        )}>
          {aviso.texto}
        </span>
      )}
    </Link>
  )
}
