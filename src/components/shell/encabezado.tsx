export function Encabezado({
  titulo,
  descripcion,
  acciones,
  fijo,
  enLinea,
}: {
  titulo: string
  descripcion?: string
  acciones?: React.ReactNode
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
}) {
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
      <div className="min-w-0 space-y-1">
        <h1 className={enLinea ? 'truncate text-xl font-semibold tracking-tight sm:text-2xl' : 'text-2xl font-semibold tracking-tight'}>{titulo}</h1>
        {descripcion && <p className="text-sm text-muted-foreground">{descripcion}</p>}
      </div>
      {acciones && <div className="flex shrink-0 items-center gap-2">{acciones}</div>}
    </div>
  )
}
