import { cn } from '@/lib/utils'
import { BotonVolver } from '@/components/shell/volver'

export function Encabezado({
  titulo,
  descripcion,
  acciones,
  fijo,
  enLinea,
  volver,
  centro,
  centroEnLinea,
}: {
  titulo: string
  descripcion?: string
  acciones?: React.ReactNode
  /**
   * Flecha de "atrás" antes del título. Devuelve a la última pantalla desde la
   * que se llegó (ver `BotonVolver`); `true` usa como respaldo el padre de la
   * ruta, y una cadena fija ese respaldo (para rutas cuyo padre no es página).
   */
  volver?: boolean | string
  /**
   * Título y acciones en una sola fila también en el celular, con menos aire
   * debajo. Para listados donde las acciones son solo iconos y apilarlas
   * gastaba media pantalla antes de llegar al contenido.
   */
  enLinea?: boolean
  /**
   * Deja el título anclado bajo la barra superior mientras el contenido se
   * desplaza. Útil en pantallas largas (formularios, listados extensos) donde
   * perder de vista dónde se está desorienta.
   *
   * Los márgenes negativos cancelan el padding del <main> en los tres lados:
   * horizontalmente para que la banda llegue a los bordes, y arriba para que
   * arranque pegada a la barra superior — si quedara un hueco encima, ese
   * hueco se desplazaría antes de que el título se ancle, que es justo el
   * salto que se quiere evitar. El relleno propio devuelve el aire por dentro.
   */
  fijo?: boolean
  /**
   * Contenido centrado entre el título y las acciones (p. ej. el buscador del
   * listado). En pantallas anchas (xl) queda al centro de la fila; en las más
   * angostas baja a una fila propia a todo el ancho, debajo del título: con el
   * menú lateral abierto no cabe al lado sin aplastar el título.
   */
  centro?: React.ReactNode
  /**
   * El `centro` se queda en la fila del título también en el celular, en vez de
   * bajar a una fila propia. Para cuando las acciones son solo un ícono y el
   * centro es un buscador compacto (Novedades): así no gasta un renglón.
   */
  centroEnLinea?: boolean
}) {
  if (centro) {
    return (
      <div className={cn(
        'mb-4 flex items-center justify-between gap-3 xl:grid xl:grid-cols-[1fr_minmax(16rem,28rem)_1fr]',
        centroEnLinea ? 'gap-2 sm:gap-3' : 'flex-wrap',
      )}>
        {/* Sin min-w-0: el título entero marca el ancho mínimo de su columna. */}
        <div className={volver ? 'flex items-start gap-1.5' : undefined}>
          {volver && <BotonVolver fallback={typeof volver === 'string' ? volver : undefined} className="-ml-2 mt-0.5" />}
          <h1 className="whitespace-nowrap text-xl font-semibold tracking-tight sm:text-2xl">{titulo}</h1>
        </div>
        <div className={centroEnLinea ? 'min-w-0 flex-1 sm:max-w-md xl:max-w-none' : 'order-last w-full sm:max-w-md xl:order-none xl:max-w-none'}>{centro}</div>
        {acciones && <div className="flex shrink-0 items-center gap-2 xl:justify-self-end">{acciones}</div>}
      </div>
    )
  }
  return (
    <div
      className={
        fijo
          ? 'sticky top-14 z-20 -mx-4 -mt-4 mb-6 flex flex-col gap-3 border-b bg-background/95 px-4 pt-4 pb-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:flex-row sm:items-center sm:justify-between lg:-mx-6 lg:-mt-6 lg:px-6 lg:pt-6'
          : enLinea
            ? 'mb-4 flex items-center justify-between gap-3'
            : 'mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'
      }
    >
      <div className={volver ? 'flex min-w-0 items-start gap-1.5' : 'min-w-0 space-y-1'}>
        {volver && <BotonVolver fallback={typeof volver === 'string' ? volver : undefined} className="-ml-2 mt-0.5" />}
        <div className="min-w-0 space-y-1">
          <h1 className={enLinea ? 'truncate text-xl font-semibold tracking-tight sm:text-2xl' : 'text-2xl font-semibold tracking-tight'}>{titulo}</h1>
          {descripcion && <p className="text-sm text-muted-foreground">{descripcion}</p>}
        </div>
      </div>
      {acciones && <div className="flex shrink-0 items-center gap-2">{acciones}</div>}
    </div>
  )
}
